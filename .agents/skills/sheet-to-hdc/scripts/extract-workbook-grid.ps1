param(
  [Parameter(Mandatory = $true)]
  [string]$InputPath,

  [Parameter(Mandatory = $false)]
  [string]$OutputPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Convert-ColumnLettersToNumber {
  param([string]$Letters)

  $value = 0
  foreach ($char in $Letters.ToUpperInvariant().ToCharArray()) {
    if ($char -lt 'A' -or $char -gt 'Z') {
      continue
    }
    $value = ($value * 26) + ([int][char]$char - [int][char]'A' + 1)
  }
  return $value
}

function Get-ZipEntryText {
  param(
    [System.IO.Compression.ZipArchive]$Zip,
    [string]$EntryName
  )

  $normalized = $EntryName -replace '\\', '/'
  $entry = $Zip.GetEntry($normalized)
  if ($null -eq $entry) {
    return $null
  }

  $stream = $entry.Open()
  try {
    $reader = [System.IO.StreamReader]::new($stream)
    try {
      return $reader.ReadToEnd()
    } finally {
      $reader.Dispose()
    }
  } finally {
    $stream.Dispose()
  }
}

function Convert-ToXml {
  param([string]$XmlText)

  $xml = [xml]::new()
  $xml.PreserveWhitespace = $false
  $xml.LoadXml($XmlText)
  return $xml
}

function Get-CellParts {
  param([string]$Address, [int]$FallbackRow)

  if ($Address -match '^([A-Za-z]+)(\d+)$') {
    return @{
      ColumnName = $Matches[1].ToUpperInvariant()
      Column = Convert-ColumnLettersToNumber $Matches[1]
      Row = [int]$Matches[2]
    }
  }

  return @{
    ColumnName = ""
    Column = 0
    Row = $FallbackRow
  }
}

function Read-SharedStrings {
  param([System.IO.Compression.ZipArchive]$Zip)

  $text = Get-ZipEntryText $Zip "xl/sharedStrings.xml"
  if ([string]::IsNullOrWhiteSpace($text)) {
    return @()
  }

  $xml = Convert-ToXml $text
  $namespace = [System.Xml.XmlNamespaceManager]::new($xml.NameTable)
  $namespace.AddNamespace("x", "http://schemas.openxmlformats.org/spreadsheetml/2006/main")

  $strings = @()
  foreach ($node in $xml.SelectNodes("//x:si", $namespace)) {
    $strings += $node.InnerText
  }
  return $strings
}

function Resolve-WorksheetPath {
  param(
    [string]$Target
  )

  $clean = $Target -replace '\\', '/'
  if ($clean.StartsWith("/")) {
    return $clean.TrimStart("/")
  }
  if ($clean.StartsWith("xl/")) {
    return $clean
  }
  return "xl/$clean"
}

function Read-WorkbookSheets {
  param([System.IO.Compression.ZipArchive]$Zip)

  $workbookText = Get-ZipEntryText $Zip "xl/workbook.xml"
  $relsText = Get-ZipEntryText $Zip "xl/_rels/workbook.xml.rels"
  if ([string]::IsNullOrWhiteSpace($workbookText) -or [string]::IsNullOrWhiteSpace($relsText)) {
    throw "Workbook metadata was not found. Is this a valid .xlsx/.xlsm file?"
  }

  $workbook = Convert-ToXml $workbookText
  $rels = Convert-ToXml $relsText

  $workbookNs = [System.Xml.XmlNamespaceManager]::new($workbook.NameTable)
  $workbookNs.AddNamespace("x", "http://schemas.openxmlformats.org/spreadsheetml/2006/main")
  $workbookNs.AddNamespace("r", "http://schemas.openxmlformats.org/officeDocument/2006/relationships")

  $relationshipTargets = @{}
  foreach ($rel in $rels.Relationships.Relationship) {
    $relationshipTargets[$rel.Id] = Resolve-WorksheetPath $rel.Target
  }

  $sheets = @()
  foreach ($sheet in $workbook.SelectNodes("//x:sheets/x:sheet", $workbookNs)) {
    $relationshipId = $sheet.GetAttribute("id", "http://schemas.openxmlformats.org/officeDocument/2006/relationships")
    $sheets += [ordered]@{
      name = $sheet.GetAttribute("name")
      sheetId = $sheet.GetAttribute("sheetId")
      relationshipId = $relationshipId
      path = $relationshipTargets[$relationshipId]
    }
  }
  return $sheets
}

function Read-WorksheetCells {
  param(
    [System.IO.Compression.ZipArchive]$Zip,
    [object[]]$SharedStrings,
    [string]$Path
  )

  $text = Get-ZipEntryText $Zip $Path
  if ([string]::IsNullOrWhiteSpace($text)) {
    return @{
      dimension = ""
      cells = @()
    }
  }

  $xml = Convert-ToXml $text
  $namespace = [System.Xml.XmlNamespaceManager]::new($xml.NameTable)
  $namespace.AddNamespace("x", "http://schemas.openxmlformats.org/spreadsheetml/2006/main")

  $dimension = ""
  $dimensionNode = $xml.SelectSingleNode("//x:dimension", $namespace)
  if ($null -ne $dimensionNode) {
    $dimension = $dimensionNode.GetAttribute("ref")
  }

  $cells = @()
  foreach ($row in $xml.SelectNodes("//x:sheetData/x:row", $namespace)) {
    $rowNumber = 0
    if (-not [int]::TryParse($row.GetAttribute("r"), [ref]$rowNumber)) {
      $rowNumber = 0
    }

    foreach ($cell in $row.SelectNodes("x:c", $namespace)) {
      $address = $cell.GetAttribute("r")
      $parts = Get-CellParts $address $rowNumber
      $type = $cell.GetAttribute("t")
      $style = $cell.GetAttribute("s")
      $formulaNode = $cell.SelectSingleNode("x:f", $namespace)
      $valueNode = $cell.SelectSingleNode("x:v", $namespace)
      $inlineNode = $cell.SelectSingleNode("x:is", $namespace)
      $rawValue = if ($null -ne $valueNode) { $valueNode.InnerText } else { "" }
      $value = $rawValue

      if ($type -eq "s" -and $rawValue -match '^\d+$') {
        $index = [int]$rawValue
        if ($index -ge 0 -and $index -lt $SharedStrings.Count) {
          $value = $SharedStrings[$index]
        }
      } elseif ($type -eq "b") {
        $value = if ($rawValue -eq "1") { "TRUE" } else { "FALSE" }
      } elseif ($type -eq "inlineStr" -and $null -ne $inlineNode) {
        $value = $inlineNode.InnerText
      }

      if (-not [string]::IsNullOrWhiteSpace($value) -or $null -ne $formulaNode) {
        $cells += [ordered]@{
          address = $address
          row = $parts.Row
          column = $parts.Column
          columnName = $parts.ColumnName
          value = $value
          rawValue = $rawValue
          type = $type
          style = $style
          formula = if ($null -ne $formulaNode) { $formulaNode.InnerText } else { "" }
        }
      }
    }
  }

  return @{
    dimension = $dimension
    cells = $cells
  }
}

$resolvedInput = (Resolve-Path -LiteralPath $InputPath).Path
$extension = [System.IO.Path]::GetExtension($resolvedInput).ToLowerInvariant()
if ($extension -ne ".xlsx" -and $extension -ne ".xlsm") {
  throw "Only .xlsx and .xlsm files are supported by this extractor. Convert CSV/TSV to JSON manually or author the IR directly."
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$zip = [System.IO.Compression.ZipFile]::OpenRead($resolvedInput)
try {
  $sharedStrings = Read-SharedStrings $zip
  $sheets = Read-WorkbookSheets $zip
  $resultSheets = @()

  foreach ($sheet in $sheets) {
    $worksheet = Read-WorksheetCells $zip $sharedStrings $sheet.path
    $resultSheets += [ordered]@{
      name = $sheet.name
      sheetId = $sheet.sheetId
      path = $sheet.path
      dimension = $worksheet.dimension
      cells = $worksheet.cells
    }
  }

  $result = [ordered]@{
    sourcePath = $resolvedInput
    extractedAt = (Get-Date).ToUniversalTime().ToString("o")
    sheets = $resultSheets
  }

  $json = $result | ConvertTo-Json -Depth 20
  if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $json
  } else {
    $json | Set-Content -LiteralPath $OutputPath -Encoding UTF8
    Write-Host "Wrote $OutputPath"
  }
} finally {
  $zip.Dispose()
}

param(
  [Parameter(Mandatory = $true)]
  [string]$InputPath,

  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

[xml]$document = Get-Content -LiteralPath $InputPath -Raw

if ($document.DocumentElement.Name -ne 'CHARACTER') {
  throw "Expected a CHARACTER root, found $($document.DocumentElement.Name)."
}

foreach ($power in @($document.SelectNodes('/CHARACTER/POWERS/*'))) {
  $power.RemoveAttribute('LVLCOST')
}

foreach ($modifier in @($document.SelectNodes('//MODIFIER'))) {
  $modifier.RemoveAttribute('ISLIMITATION')
}

$numericIds = @($document.SelectNodes('//*[@ID]') | ForEach-Object {
  $value = 0L
  if ([long]::TryParse($_.GetAttribute('ID'), [ref]$value)) { $value }
})
$nextId = [Math]::Max(([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()), (($numericIds | Measure-Object -Maximum).Maximum + 1))

function Add-HdcAdder {
  param(
    [System.Xml.XmlElement]$Parent,
    [string]$XmlId,
    [string]$Alias,
    [string]$BaseCost,
    [string]$Option,
    [string]$OptionAlias
  )

  if ($Parent.SelectSingleNode("./ADDER[@XMLID='$XmlId']")) {
    return
  }

  $script:nextId += 1
  $adder = $document.CreateElement('ADDER')
  $attributes = [ordered]@{
    MULTIPLIER = '1.0'
    GRAPHIC = 'Burst'
    COLOR = '255 255 255'
    SFX = 'Default'
    SHOW_ACTIVE_COST = 'Yes'
    INCLUDE_NOTES_IN_PRINTOUT = 'Yes'
    ID = $script:nextId.ToString()
    XMLID = $XmlId
    NAME = ''
    ALIAS = $Alias
    POSITION = '-1'
    BASECOST = $BaseCost
    LEVELS = '0'
    LVLCOST = '0'
    OPTION = $Option
    OPTIONID = $Option
    OPTION_ALIAS = $OptionAlias
    SELECTED = 'YES'
    INCLUDEINBASE = 'Yes'
    SHOWALIAS = 'Yes'
    PRIVATE = 'No'
    REQUIRED = 'Yes'
    DISPLAYINSTRING = 'Yes'
    GROUP = 'No'
  }
  foreach ($entry in $attributes.GetEnumerator()) {
    $adder.SetAttribute($entry.Key, $entry.Value)
  }
  $notes = $document.CreateElement('NOTES')
  [void]$adder.AppendChild($notes)
  [void]$Parent.AppendChild($adder)
}

foreach ($skill in @($document.SelectNodes('/CHARACTER/SKILLS/*[@XMLID="STEALTH"]'))) {
  $skill.SetAttribute('CHARACTERISTIC', 'DEX')
}

$skillIdentities = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
foreach ($skill in @($document.SelectNodes('/CHARACTER/SKILLS/*'))) {
  foreach ($identity in $skill.GetAttribute('NAME'), $skill.GetAttribute('ALIAS')) {
    if (-not [string]::IsNullOrWhiteSpace($identity)) {
      [void]$skillIdentities.Add($identity.Trim())
    }
  }
}

foreach ($modifier in @($document.SelectNodes('//MODIFIER[@XMLID="REQUIRESASKILLROLL"]'))) {
  $binding = $modifier.GetAttribute('COMMENTS')
  if ([string]::IsNullOrWhiteSpace($binding)) {
    $binding = $modifier.GetAttribute('INPUT')
  }
  if (-not [string]::IsNullOrWhiteSpace($binding) -and $skillIdentities.Contains($binding.Trim())) {
    $modifier.SetAttribute('OPTION_ALIAS', $binding.Trim())
    $modifier.SetAttribute('COMMENTS', $binding.Trim())
    $modifier.RemoveAttribute('INPUT')
  }
}

$attackDefenseDefaults = @{
  ENERGYBLAST = 'ED'
  HANDTOHANDATTACK = 'PD'
  HKA = 'PD'
  RKA = 'PD'
  TELEKINESIS = 'PD'
}
foreach ($power in @($document.SelectNodes('//POWER'))) {
  $defense = $attackDefenseDefaults[$power.GetAttribute('XMLID')]
  if ($defense -and [string]::IsNullOrWhiteSpace($power.GetAttribute('INPUT'))) {
    $power.SetAttribute('INPUT', $defense)
  }
}

foreach ($perk in @($document.SelectNodes('/CHARACTER/PERKS/*[@XMLID="VEHICLE_BASE"]'))) {
  if ($perk.GetAttribute('LEVELS') -eq '0') {
    $basePoints = 0.0
    if ([double]::TryParse($perk.GetAttribute('BASEPOINTS'), [ref]$basePoints) -and $basePoints -ge 5) {
      $perk.SetAttribute('LEVELS', ([Math]::Round($basePoints / 5)).ToString())
    }
  }
}

foreach ($reputation in @($document.SelectNodes('/CHARACTER/PERKS/*[@XMLID="REPUTATION"]'))) {
  Add-HdcAdder -Parent $reputation -XmlId 'HOWWIDE' -Alias 'How Widely Known' -BaseCost '0' -Option 'SMALLGROUP' -OptionAlias 'A small to medium sized group'
  Add-HdcAdder -Parent $reputation -XmlId 'HOWWELL' -Alias 'How Well Known' -BaseCost '0' -Option '11' -OptionAlias '11-'
  if ($reputation.GetAttribute('LEVELS') -eq '0') {
    $points = 0.0
    if ([double]::TryParse($reputation.GetAttribute('BASECOST'), [ref]$points) -and $points -gt 0) {
      $reputation.SetAttribute('BASECOST', '0')
      $reputation.SetAttribute('LEVELS', ([Math]::Round($points)).ToString())
    }
  }
}

foreach ($disad in @($document.SelectNodes('/CHARACTER/DISADVANTAGES/DISAD[@XMLID="PSYCHOLOGICALLIMITATION"]'))) {
  Add-HdcAdder -Parent $disad -XmlId 'INTENSITY' -Alias 'Intensity Is' -BaseCost '5' -Option 'STRONG' -OptionAlias 'Strong'
}

foreach ($disad in @($document.SelectNodes('/CHARACTER/DISADVANTAGES/DISAD[@XMLID="HUNTED"]'))) {
  Add-HdcAdder -Parent $disad -XmlId 'APPEARANCE' -Alias 'Appearance' -BaseCost '0' -Option 'EIGHT' -OptionAlias 'Infrequently'
  Add-HdcAdder -Parent $disad -XmlId 'CAPABILITIES' -Alias 'Capabilities' -BaseCost '5' -Option 'LESS' -OptionAlias '(Less Pow'
  Add-HdcAdder -Parent $disad -XmlId 'MOTIVATION' -Alias 'Motivation' -BaseCost '0' -Option 'HARSH' -OptionAlias 'Harshly Punish'
}

foreach ($adder in @($document.SelectNodes('//ADDER'))) {
  if ([string]::IsNullOrWhiteSpace($adder.GetAttribute('ALIAS'))) {
    $notesNode = $adder.SelectSingleNode('./NOTES')
    $notes = if ($notesNode) { $notesNode.InnerText } else { '' }
    $alias = if ($notes -match 'free power|free adjustment') { 'Campaign free adjustment' } else { 'Custom Adder' }
    $adder.SetAttribute('ALIAS', $alias)
  }
}

foreach ($maneuver in @($document.SelectNodes('/CHARACTER/MARTIALARTS/MANEUVER[@XMLID="MANEUVER"]'))) {
  if ([string]::IsNullOrWhiteSpace($maneuver.GetAttribute('NAME'))) {
    $baseName = $maneuver.GetAttribute('DISPLAY')
    if (-not [string]::IsNullOrWhiteSpace($baseName)) {
      $maneuver.SetAttribute('NAME', $baseName)
    }
  }
}

$outputDirectory = Split-Path -Parent $OutputPath
if ($outputDirectory) {
  New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}

$settings = [System.Xml.XmlWriterSettings]::new()
$settings.Encoding = [System.Text.UTF8Encoding]::new($false)
$settings.Indent = $false
$settings.OmitXmlDeclaration = $false

$writer = [System.Xml.XmlWriter]::Create($OutputPath, $settings)
try {
  $document.Save($writer)
} finally {
  $writer.Dispose()
}

Write-Output "Wrote $OutputPath"

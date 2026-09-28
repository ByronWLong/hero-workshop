# Hero Workshop for Foundry VTT

A Foundry VTT v14 module for the [Hero System 6e (Unofficial) v2](https://github.com/dmdorman/hero6e-foundryvtt) system (`hero6efoundryvttv2`, 5.x). It opens Hero Workshop's character editor on any actor that has Hero Designer data.

## How it works

hero6e keeps the actor's source HDC in `actor.system._hdcXml`. When you open the editor:

1. **Foundry changes are checked.** Edits made on hero6e's own sheets, such as changed levels or added and removed adders, are compared with the stored HDC. You choose which ones to keep before editing.
2. **You edit in Hero Workshop.** You get the same tabs as the web app.
3. **The changes are reviewed and applied.** The HDC is patched rather than regenerated, and the actor is re-imported with hero6e's own `uploadFromXml`. Damage, used charges, and Foundry item IDs are preserved.

## Build and install

```bash
npm run build:foundry            # from the repo root; output in packages/foundry-module/dist
```

`dist/` is the module folder. Link or copy it to `<Foundry data>/Data/modules/hero-workshop` and enable **Hero Workshop** in your world.

## Using it

- On a hero6e actor sheet, open the header menu (⋮) and choose **Edit in Hero Workshop** or **Inspect HDC**.
- You can also right-click an actor in the Actors sidebar for the same options.
- Macro access:
  ```js
  const api = game.modules.get('hero-workshop').api;
  api.openEditor(actor);
  api.openInspector(actor);
  api.driftReport(actor); // Foundry-side changes not yet in the HDC
  ```

Unlinked token actors are edited through their base actor.

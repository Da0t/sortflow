import { Menu, Tray, app, nativeImage } from "electron";

let tray: Tray | null = null;

export function createTray(openWindow: () => void): Tray {
  tray = new Tray(nativeImage.createEmpty());
  tray.setTitle("⚑"); // text-based menu-bar item; replace with a template icon post-v1
  const rebuild = () => {
    const { openAtLogin } = app.getLoginItemSettings();
    tray?.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Open Sortflow", click: openWindow },
        {
          label: "Launch at login",
          type: "checkbox",
          checked: openAtLogin,
          click: () => {
            app.setLoginItemSettings({ openAtLogin: !openAtLogin });
            rebuild();
          },
        },
        { type: "separator" },
        { label: "Quit Sortflow", click: () => app.quit() },
      ]),
    );
  };
  rebuild();
  return tray;
}

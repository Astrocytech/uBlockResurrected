(() => {
  // theme.ts
  function getActualTheme(nominalTheme) {
    let theme = nominalTheme || "light";
    if (nominalTheme === "auto") {
      if (typeof self.matchMedia === "function") {
        const mql = self.matchMedia("(prefers-color-scheme: dark)");
        theme = mql instanceof Object && mql.matches === true ? "dark" : "light";
      } else {
        theme = "light";
      }
    }
    return theme;
  }
  function setTheme(theme, propagate = false) {
    theme = getActualTheme(theme);
    let w = self;
    for (; ; ) {
      const rootcl = w.document.documentElement.classList;
      if (theme === "dark") {
        rootcl.add("dark");
        rootcl.remove("light");
      } else {
        rootcl.add("light");
        rootcl.remove("dark");
      }
      if (propagate === false) {
        break;
      }
      if (w === w.parent) {
        break;
      }
      w = w.parent;
      try {
        void w.document;
      } catch {
        return;
      }
    }
  }
  function setAccentColor(accentEnabled, accentColor, propagate, stylesheet = "") {
    if (accentEnabled && stylesheet === "" && self.hsluv !== void 0) {
      const toRGB = (hsl2) => self.hsluv.hsluvToRgb(hsl2).map((a) => Math.round(a * 255)).join(" ");
      const hsl = self.hsluv.hexToHsluv(accentColor);
      hsl[0] = Math.round(hsl[0] * 10) / 10;
      hsl[1] = Math.round(Math.min(100, Math.max(0, hsl[1])));
      const shades = [5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95];
      const text = [];
      text.push(":root.accented {");
      for (const shade of shades) {
        hsl[2] = shade;
        text.push(`   --primary-${shade}: ${toRGB(hsl)};`);
      }
      text.push("}");
      hsl[1] = Math.min(25, hsl[1]);
      hsl[2] = 80;
      text.push(
        ":root.light.accented {",
        `    --button-surface-rgb: ${toRGB(hsl)};`,
        "}"
      );
      hsl[2] = 30;
      text.push(
        ":root.dark.accented {",
        `    --button-surface-rgb: ${toRGB(hsl)};`,
        "}"
      );
      text.push("");
      stylesheet = text.join("\n");
      vAPI.messaging.send("dom", { what: "uiAccentStylesheet", stylesheet });
    }
    let w = self;
    for (; ; ) {
      const wdoc = w.document;
      let style = wdoc.querySelector("style#accentColors");
      if (style !== null) {
        style.remove();
      }
      if (accentEnabled) {
        style = wdoc.createElement("style");
        style.id = "accentColors";
        style.textContent = stylesheet;
        wdoc.head.append(style);
        wdoc.documentElement.classList.add("accented");
      } else {
        wdoc.documentElement.classList.remove("accented");
      }
      if (propagate === false) {
        break;
      }
      if (w === w.parent) {
        break;
      }
      w = w.parent;
      try {
        void w.document;
      } catch {
        break;
      }
    }
  }
  {
    vAPI.messaging.send("dom", { what: "uiStyles" }).then((response) => {
      if (typeof response !== "object" || response === null) {
        return;
      }
      const r = response;
      setTheme(r.uiTheme);
      if (r.uiAccentCustom) {
        setAccentColor(
          true,
          r.uiAccentCustom0,
          false,
          r.uiAccentStylesheet
        );
      }
      if (r.uiStyles !== "unset") {
        document.body.style.cssText = r.uiStyles;
      }
    });
    const rootcl = document.documentElement.classList;
    if (vAPI.webextFlavor.soup.has("mobile")) {
      rootcl.add("mobile");
    } else {
      rootcl.add("desktop");
    }
    if (window.matchMedia("(min-resolution: 150dpi)").matches) {
      rootcl.add("hidpi");
    }
  }
})();

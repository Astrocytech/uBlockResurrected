(() => {
  // scriptlets/updater.ts
  (() => {
    if (document instanceof HTMLDocument === false) {
      return;
    }
    if (typeof vAPI !== "object" || vAPI === null) {
      return;
    }
    function updateStockLists(target) {
      if (vAPI instanceof Object === false) {
        document.removeEventListener("click", updateStockLists);
        return;
      }
      try {
        const updateURL = new URL(target.href);
        if (updateURL.hostname !== "ublockorigin.github.io") {
          return;
        }
        if (updateURL.pathname !== "/uAssets/update-lists.html") {
          return;
        }
        const listkeys = updateURL.searchParams.get("listkeys") || "";
        if (listkeys === "") {
          return;
        }
        let auto = true;
        const manual = updateURL.searchParams.get("manual");
        if (manual === "1") {
          auto = false;
        } else if (/^\d{6}$/.test(`${manual}`)) {
          const year = parseInt(manual.slice(0, 2)) || 0;
          const month = parseInt(manual.slice(2, 4)) || 0;
          const day = parseInt(manual.slice(4, 6)) || 0;
          if (year !== 0 && month !== 0 && day !== 0) {
            const date = /* @__PURE__ */ new Date();
            date.setUTCFullYear(2e3 + year, month - 1, day);
            date.setUTCHours(0);
            const then = date.getTime() / 1e3 / 3600;
            const now = Date.now() / 1e3 / 3600;
            auto = then < now - 48 || then > now + 48;
          }
        }
        vAPI.messaging.send("scriptlets", {
          what: "updateLists",
          listkeys,
          auto
        });
        return true;
      } catch {
      }
    }
    document.addEventListener("click", (ev) => {
      if (ev.button !== 0 || ev.isTrusted === false) {
        return;
      }
      const target = ev.target.closest("a");
      if (target instanceof HTMLAnchorElement === false) {
        return;
      }
      if (updateStockLists(target) === true) {
        ev.stopPropagation();
        ev.preventDefault();
      }
    });
  })();
})();

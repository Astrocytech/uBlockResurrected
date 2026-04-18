(() => {
  // scriptlets/subscriber.ts
  (() => {
    if (document instanceof HTMLDocument === false) {
      return;
    }
    if (typeof vAPI !== "object" || vAPI === null) {
      return;
    }
    const onMaybeSubscriptionLinkClicked = function(target) {
      if (vAPI instanceof Object === false) {
        document.removeEventListener("click", onMaybeSubscriptionLinkClicked);
        return;
      }
      try {
        const subscribeURL = new URL(
          target.href.replace("&amp;title=", "&title=")
        );
        if (/^(abp|ubo):$/.test(subscribeURL.protocol) === false && subscribeURL.hostname !== "subscribe.adblockplus.org") {
          return;
        }
        const location = subscribeURL.searchParams.get("location") || "";
        const title = subscribeURL.searchParams.get("title") || "";
        if (location === "" || title === "") {
          return true;
        }
        if (/^(file|https?):\/\//.test(location) === false) {
          return true;
        }
        vAPI.messaging.send("scriptlets", {
          what: "subscribeTo",
          location,
          title
        });
        return true;
      } catch {
      }
    };
    document.addEventListener("click", (ev) => {
      if (ev.button !== 0 || ev.isTrusted === false) {
        return;
      }
      const target = ev.target.closest("a");
      if (target instanceof HTMLAnchorElement === false) {
        return;
      }
      if (onMaybeSubscriptionLinkClicked(target) === true) {
        ev.stopPropagation();
        ev.preventDefault();
      }
    });
  })();
})();

const registerServiceWorker = () => {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  const register = () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        const logState = (worker: ServiceWorker | null) => {
          if (!worker) return;
          const state = worker.state;
          if (state === "installed") {
            if (navigator.serviceWorker.controller) {
              console.info("ChronoVerse update available – reload when convenient.");
            } else {
              console.info("ChronoVerse is ready to work offline.");
            }
          }
        };

        if (registration.installing) {
          registration.installing.addEventListener("statechange", () =>
            logState(registration.installing)
          );
        }
        if (registration.waiting) {
          logState(registration.waiting);
        }
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (worker) {
            worker.addEventListener("statechange", () => logState(worker));
          }
        });
      })
      .catch((err) => {
        console.warn("ChronoVerse service worker registration failed", err);
      });
  };

  if (document.readyState === "complete") {
    register();
  } else {
    window.addEventListener("load", register, { once: true });
  }
};

export default registerServiceWorker;

/**
 * Landing page: theme, mobile drawer, terminal typing, and live tx feed cycling.
 * No wallet, vault, or Miden SDK imports.
 */

/** Same key as the app so light or dark mode stays in sync across pages. */
const THEME_STORAGE_KEY = "privex_theme";

/** Stored value when the user prefers light mode. */
const THEME_LIGHT = "light";

/** Stored value when the user prefers dark mode. */
const THEME_DARK = "dark";

/** Command line shown in the hero terminal widget. */
const TYPED_COMMAND = "privex create-rule --private";

/** Rotating rows fed into the oldest visible tx line during the cycle animation. */
const NEW_TX_ROWS: ReadonlyArray<{
  hash: string;
  action: string;
  status: "confirmed" | "pending" | "sealed";
}> = [
  { hash: "0x9a3d...2f17", action: "Vault rule modified", status: "confirmed" },
  { hash: "0x4c8b...e390", action: "Assets added - ▓▓▓▓ USDC", status: "sealed" },
  { hash: "0x7f2a...1c84", action: "Recipient updated", status: "confirmed" },
  { hash: "0x2e5f...8b29", action: "Check-in signal sent", status: "confirmed" },
  { hash: "0xb1d9...4a73", action: "Condition triggered", status: "pending" },
  { hash: "0x6c4e...f201", action: "Note released privately", status: "sealed" },
  { hash: "0xf3a1...cc82", action: "New vault deployed", status: "confirmed" },
];

/** Index into NEW_TX_ROWS for the next cycled row. */
let newTxIndex = 0;

/**
 * Applies the saved theme from localStorage to the document body.
 */
function applySavedTheme(): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === THEME_LIGHT) {
    document.body.classList.add("light");
  } else {
    document.body.classList.remove("light");
  }
}

/**
 * Theme toggle via document-level delegation so clicks on the icon inside the button still work.
 */
function setupThemeToggle(): void {
  document.addEventListener("click", (e: MouseEvent) => {
    const raw = e.target;
    if (!(raw instanceof Element)) {
      return;
    }
    if (raw.closest("#themeBtn") || raw.closest(".btn-theme")) {
      document.body.classList.toggle("light");
      const theme = document.body.classList.contains("light")
        ? THEME_LIGHT
        : THEME_DARK;
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
      }
    }
  });
}

/**
 * Opens and closes the mobile nav drawer and closes it after in-drawer link taps.
 */
function setupMobileMenu(): void {
  const menuBtn = document.querySelector("#menuBtn");
  const drawer = document.querySelector("#ndrawer");
  if (!(menuBtn instanceof HTMLButtonElement) || !(drawer instanceof HTMLElement)) {
    return;
  }
  menuBtn.addEventListener("click", () => {
    drawer.classList.toggle("open");
  });
  drawer.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      drawer.classList.remove("open");
    });
  });
}

/**
 * Types the fake CLI command one character at a time, then reveals the sealed block and results.
 * Calls startTxFeed only after the typed line and follow-up panels finish their staged reveal.
 */
function typeCmd(charIndex: number): void {
  const cmdEl = document.querySelector("#typed-cmd");
  const cursorEl = document.querySelector("#typed-cursor");
  const blockEl = document.querySelector("#tblock");
  const resultsEl = document.querySelector("#tresults");
  if (
    !(cmdEl instanceof HTMLElement) ||
    !(cursorEl instanceof HTMLElement) ||
    !(blockEl instanceof HTMLElement) ||
    !(resultsEl instanceof HTMLElement)
  ) {
    return;
  }
  if (charIndex < TYPED_COMMAND.length) {
    cmdEl.textContent += TYPED_COMMAND.charAt(charIndex);
    window.setTimeout(
      () => {
        typeCmd(charIndex + 1);
      },
      45 + Math.random() * 35
    );
    return;
  }
  cursorEl.style.display = "none";
  window.setTimeout(() => {
    blockEl.style.opacity = "1";
    window.setTimeout(() => {
      resultsEl.style.opacity = "1";
      startTxFeed();
    }, 500);
  }, 350);
}

/**
 * Fades in the four static tx rows, then starts the rotation timer.
 */
function startTxFeed(): void {
  const ids = ["tx1", "tx2", "tx3", "tx4"] as const;
  ids.forEach((id, index) => {
    const row = document.getElementById(id);
    if (row !== null) {
      window.setTimeout(() => {
        row.classList.add("show");
      }, index * 420);
    }
  });
  window.setTimeout(() => {
    cycleTxFeed();
  }, 2600);
}

/**
 * Moves the oldest visible row to the bottom with updated hash, action, and status.
 */
function cycleTxFeed(): void {
  const feed = document.querySelectorAll(".tx-item.show");
  if (feed.length === 0) {
    return;
  }
  const oldest = feed[0];
  if (!(oldest instanceof HTMLElement)) {
    return;
  }
  oldest.style.opacity = "0";
  oldest.style.transform = "translateY(-5px)";
  window.setTimeout(() => {
    const ntx = NEW_TX_ROWS[newTxIndex % NEW_TX_ROWS.length];
    newTxIndex += 1;
    const hashEl = oldest.querySelector(".tx-hash");
    const actionEl = oldest.querySelector(".tx-action");
    const statusEl = oldest.querySelector(".tx-status");
    if (
      !(hashEl instanceof HTMLElement) ||
      !(actionEl instanceof HTMLElement) ||
      !(statusEl instanceof HTMLElement)
    ) {
      return;
    }
    hashEl.textContent = ntx.hash;
    actionEl.textContent = ntx.action;
    statusEl.className = `tx-status ${ntx.status}`;
    statusEl.textContent = ntx.status;
    oldest.style.transition = "none";
    oldest.style.opacity = "0";
    oldest.style.transform = "translateY(7px)";
    oldest.parentNode?.appendChild(oldest);
    window.requestAnimationFrame(() => {
      oldest.style.transition = "opacity 0.4s, transform 0.4s";
      oldest.style.opacity = "1";
      oldest.style.transform = "none";
    });
  }, 260);
  window.setTimeout(() => {
    cycleTxFeed();
  }, 1900);
}

/**
 * Clears the typed line so a reload always restarts the animation from an empty prompt.
 */
function resetTypedCommandLine(): void {
  const cmdEl = document.querySelector("#typed-cmd");
  const cursorEl = document.querySelector("#typed-cursor");
  if (cmdEl instanceof HTMLElement) {
    cmdEl.textContent = "";
  }
  if (cursorEl instanceof HTMLElement) {
    cursorEl.style.display = "";
  }
}

/**
 * Runs all landing-only setup once the DOM is ready.
 */
function init(): void {
  applySavedTheme();
  setupThemeToggle();
  setupMobileMenu();
  resetTypedCommandLine();
  window.setTimeout(() => {
    typeCmd(0);
  }, 700);
}

document.addEventListener("DOMContentLoaded", init);

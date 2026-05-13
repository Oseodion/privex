import { sendCheckIn } from "./checkin";
import { createVault, getUserVaults, getVaultStatus } from "./vault";
import {
  getConnectedAccountId,
  initClient,
  loadSavedAccountId,
  setConnectedAccountId,
} from "./wallet";

/** localStorage key for light or dark theme. */
const THEME_STORAGE_KEY = "privex_theme";

/** Value stored when the user prefers light mode. */
const THEME_LIGHT = "light";

/** Value stored when the user prefers dark mode. */
const THEME_DARK = "dark";

/**
 * Returns one element by id or null if it is missing.
 */
function queryById<T extends Element>(id: string): T | null {
  return document.querySelector<T>(`#${CSS.escape(id)}`);
}

/**
 * Shows one app screen and hides the other two using the shared hidden class.
 */
function showScreen(screen: "connect" | "dashboard" | "create"): void {
  const connect = queryById<HTMLElement>("app-screen-connect");
  const dashboard = queryById<HTMLElement>("app-screen-dashboard");
  const create = queryById<HTMLElement>("app-screen-create");
  if (!connect || !dashboard || !create) {
    return;
  }
  connect.classList.toggle("hidden", screen !== "connect");
  dashboard.classList.toggle("hidden", screen !== "dashboard");
  create.classList.toggle("hidden", screen !== "create");
  closeAllDrawers();
}

/**
 * Closes every mobile navigation drawer.
 */
function closeAllDrawers(): void {
  document.querySelectorAll(".ndrawer.open").forEach((drawer) => {
    drawer.classList.remove("open");
  });
}

/**
 * Shortens a Miden account id for display in the nav chip.
 */
function truncateAccountId(full: string): string {
  const trimmed = full.trim();
  if (trimmed.length === 0) {
    return "";
  }
  const withPrefix = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  const body = withPrefix.slice(2);
  if (body.length <= 10) {
    return withPrefix;
  }
  return `${withPrefix.slice(0, 8)}...${body.slice(-4)}`;
}

/**
 * Writes the connected account id into every wallet chip on all screens.
 */
function updateWalletChips(): void {
  const id = getConnectedAccountId();
  const label = id === null || id.length === 0 ? "" : truncateAccountId(id);
  const chips: Array<string | null> = [
    "wallet-chip-dash",
    "wallet-chip-dash-drawer",
    "wallet-chip-create",
    "wallet-chip-create-drawer",
  ];
  for (const chipId of chips) {
    const chip = queryById<HTMLElement>(chipId);
    if (chip !== null) {
      chip.textContent = label.length > 0 ? label : "0x0000...0000";
    }
  }
}

/**
 * Applies saved theme from localStorage to the document body.
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
 * Flips light mode and remembers the choice for the next visit.
 */
function toggleTheme(): void {
  document.body.classList.toggle("light");
  if (typeof localStorage === "undefined") {
    return;
  }
  const next = document.body.classList.contains("light")
    ? THEME_LIGHT
    : THEME_DARK;
  localStorage.setItem(THEME_STORAGE_KEY, next);
}

/**
 * Wires the sun or moon buttons on every screen to the same theme handler.
 */
function setupThemeToggles(): void {
  const ids = ["themeBtnConnect", "themeBtnDash", "themeBtnCreate"];
  for (const id of ids) {
    const btn = queryById<HTMLButtonElement>(id);
    if (btn === null) {
      continue;
    }
    btn.addEventListener("click", () => {
      toggleTheme();
    });
  }
}

/**
 * Opens or closes one drawer when its hamburger button is pressed.
 */
function setupDrawerToggle(
  menuButtonId: string,
  drawerId: string
): void {
  const menuBtn = queryById<HTMLButtonElement>(menuButtonId);
  const drawer = queryById<HTMLElement>(drawerId);
  if (menuBtn === null || drawer === null) {
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
 * Registers all hamburger menu pairs for the three layouts.
 */
function setupMobileMenus(): void {
  setupDrawerToggle("menuBtnConnect", "ndrawerConnect");
  setupDrawerToggle("menuBtnDash", "ndrawerDash");
  setupDrawerToggle("menuBtnCreate", "ndrawerCreate");
}

/**
 * Shows a short message under the connect hero, or hides it when text is empty.
 */
function setConnectError(message: string): void {
  const el = queryById<HTMLElement>("connect-error");
  if (el === null) {
    return;
  }
  if (message.length === 0) {
    el.textContent = "";
    el.setAttribute("hidden", "");
    return;
  }
  el.textContent = message;
  el.removeAttribute("hidden");
}

/**
 * Shows a short message on the dashboard or clears it.
 */
function setVaultMessage(message: string, show: boolean): void {
  const el = queryById<HTMLElement>("vault-message");
  if (el === null) {
    return;
  }
  el.textContent = message;
  if (show && message.length > 0) {
    el.removeAttribute("hidden");
  } else {
    el.setAttribute("hidden", "");
  }
}

/**
 * Shows or hides the inline error under the create vault form.
 */
function setFormError(message: string): void {
  const el = queryById<HTMLElement>("form-error");
  if (el === null) {
    return;
  }
  if (message.length === 0) {
    el.textContent = "";
    el.setAttribute("hidden", "");
    return;
  }
  el.textContent = message;
  el.removeAttribute("hidden");
}

/**
 * Fetches vault ids and renders one card per vault, or shows the empty state.
 */
async function loadUserVaults(): Promise<void> {
  const list = queryById<HTMLElement>("vault-list");
  const template = queryById<HTMLElement>("app-vault-row-template");
  const emptyEl = queryById<HTMLElement>("vault-empty");
  if (list === null || template === null || emptyEl === null) {
    return;
  }
  for (const child of Array.from(list.children)) {
    if (child.id === "app-vault-row-template" || child.id === "vault-empty") {
      continue;
    }
    child.remove();
  }
  try {
    const ids = await getUserVaults();
    if (ids.length === 0) {
      emptyEl.removeAttribute("hidden");
      return;
    }
    emptyEl.setAttribute("hidden", "");
    for (const vaultId of ids) {
      const card = template.cloneNode(true) as HTMLElement;
      card.removeAttribute("id");
      card.classList.remove("hidden");

      const idSpan = card.querySelector(".app-vault-id");
      if (idSpan !== null) {
        idSpan.textContent = truncateAccountId(vaultId);
      }

      const statusEl = card.querySelector(".app-status");
      const valueCells = card.querySelectorAll(".app-vault-v");
      try {
        const status = await getVaultStatus(vaultId);
        if (statusEl !== null) {
          statusEl.textContent = status.status;
          statusEl.classList.remove(
            "app-status-active",
            "app-status-triggered",
            "app-status-closed"
          );
          const s = status.status.toLowerCase();
          if (s.includes("trigger")) {
            statusEl.classList.add("app-status-triggered");
          } else if (s.includes("close")) {
            statusEl.classList.add("app-status-closed");
          } else {
            statusEl.classList.add("app-status-active");
          }
        }
        if (valueCells.length >= 2) {
          valueCells[0].textContent = status.lastCheckin;
          valueCells[1].textContent = status.deadline;
        }
      } catch {
        if (statusEl !== null) {
          statusEl.textContent = "unknown";
        }
        if (valueCells.length >= 2) {
          valueCells[0].textContent = "unknown";
          valueCells[1].textContent = "unknown";
        }
      }

      const checkBtn = card.querySelector(
        "button[data-vault-id]"
      ) as HTMLButtonElement | null;
      if (checkBtn !== null) {
        checkBtn.dataset.vaultId = vaultId;
      }

      list.appendChild(card);
    }
  } catch (err) {
    emptyEl.setAttribute("hidden", "");
    const message =
      err instanceof Error ? err.message : "Could not load your vault list.";
    setVaultMessage(message, true);
  }
}

/**
 * Runs the connect flow: SDK init, manual account id entry, then dashboard.
 */
async function handleConnectWallet(button: HTMLButtonElement): Promise<void> {
  const originalHtml = button.innerHTML;
  button.disabled = true;
  button.textContent = "Connecting...";
  setConnectError("");
  try {
    await initClient();
    const entered = window.prompt(
      "Enter your Miden account ID (hex, starting with 0x):"
    );
    if (entered === null) {
      setConnectError("Connection cancelled. You can try again when you are ready.");
      return;
    }
    const trimmed = entered.trim();
    if (trimmed.length === 0) {
      setConnectError("No account id was entered. Please enter a valid Miden account id.");
      return;
    }
    setConnectedAccountId(trimmed);
    updateWalletChips();
    showScreen("dashboard");
    setVaultMessage("", false);
    await loadUserVaults();
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Something went wrong while connecting your wallet.";
    setConnectError(message);
  } finally {
    button.disabled = false;
    button.innerHTML = originalHtml;
  }
}

/**
 * Attaches the connect wallet behavior to every connect entry point.
 */
function setupConnectButtons(): void {
  const ids = ["btn-connect-nav", "btn-connect-drawer", "btn-connect-main"];
  for (const id of ids) {
    const btn = queryById<HTMLButtonElement>(id);
    if (btn === null) {
      continue;
    }
    btn.addEventListener("click", () => {
      void handleConnectWallet(btn);
    });
  }
}

/**
 * Opens the create vault screen from any Create New Vault control.
 */
function setupCreateVaultButtons(): void {
  const ids = [
    "btn-create-vault",
    "btn-create-vault-drawer",
    "btn-create-vault-create-nav",
    "btn-create-vault-create-drawer",
  ];
  for (const id of ids) {
    const btn = queryById<HTMLButtonElement>(id);
    if (btn === null) {
      continue;
    }
    btn.addEventListener("click", () => {
      setFormError("");
      showScreen("create");
    });
  }
}

/**
 * Returns the user to the dashboard without saving the form.
 */
function setupCancelButton(): void {
  const btn = queryById<HTMLButtonElement>("btn-vault-cancel");
  if (btn === null) {
    return;
  }
  btn.addEventListener("click", () => {
    setFormError("");
    showScreen("dashboard");
  });
}

/**
 * Reads the form, calls the vault creator, and refreshes the list on success.
 */
function setupVaultFormSubmit(): void {
  const form = queryById<HTMLFormElement>("vault-create-form");
  if (form === null) {
    return;
  }
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void (async () => {
      setFormError("");
      const recipientInput = queryById<HTMLInputElement>("recipient");
      const intervalInput = queryById<HTMLInputElement>("interval");
      const amountInput = queryById<HTMLInputElement>("amount");
      if (
        recipientInput === null ||
        intervalInput === null ||
        amountInput === null
      ) {
        setFormError("The form is missing required fields. Please refresh the page.");
        return;
      }
      const recipient = recipientInput.value.trim();
      const interval = Number(intervalInput.value.trim());
      const amount = Number(amountInput.value.trim());
      try {
        await createVault(recipient, interval, amount);
        showScreen("dashboard");
        await loadUserVaults();
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Could not create the vault. Please try again.";
        setFormError(message);
      }
    })();
  });
}

/**
 * Handles check-in clicks from dynamically rendered vault cards.
 */
function setupVaultListDelegation(): void {
  const list = queryById<HTMLElement>("vault-list");
  if (list === null) {
    return;
  }
  list.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const btn = target.closest("button[data-vault-id]");
    if (!(btn instanceof HTMLButtonElement)) {
      return;
    }
    const vaultId = btn.dataset.vaultId;
    if (vaultId === undefined || vaultId.length === 0) {
      return;
    }
    void (async () => {
      try {
        const txId = await sendCheckIn(vaultId);
        setVaultMessage(`Check-in confirmed - tx: ${txId}`, true);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Check-in failed. Please try again.";
        setVaultMessage(message, true);
      }
    })();
  });
}

/**
 * Registers every interactive control after the DOM is ready.
 */
function setupAllHandlers(): void {
  setupThemeToggles();
  setupMobileMenus();
  setupConnectButtons();
  setupCreateVaultButtons();
  setupCancelButton();
  setupVaultFormSubmit();
  setupVaultListDelegation();
}

/**
 * First paint: start the SDK, restore session and theme, then show the right screen.
 */
async function bootstrap(): Promise<void> {
  applySavedTheme();
  setConnectError("");
  setFormError("");
  setVaultMessage("", false);
  let clientReady = false;
  try {
    await initClient();
    clientReady = true;
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Could not reach the Miden testnet client.";
    setConnectError(message);
  }
  let savedAccountReady = false;
  try {
    const saved = loadSavedAccountId();
    savedAccountReady = saved !== null && saved.length > 0;
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Could not read your saved wallet from this browser.";
    setConnectError(message);
  }
  if (clientReady && savedAccountReady) {
    updateWalletChips();
    showScreen("dashboard");
    await loadUserVaults();
  } else {
    showScreen("connect");
  }
  setupAllHandlers();
}

document.addEventListener("DOMContentLoaded", () => {
  void bootstrap();
});

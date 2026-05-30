import { sendCheckIn } from "./checkin";
import {
  createVault,
  getUserVaults,
  getVaultStatus,
  isPrivateAccountLookupError,
} from "./vault";
import {
  clearConnectedAccount,
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

/** True when the user connected via Miden Wallet extension (no MidenClient needed). */
let connectedViaExtension = false;

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
 * Closes the dashboard wallet address dropdown.
 */
function closeWalletDropdown(): void {
  const dropdown = queryById<HTMLElement>("wallet-dropdown-dash");
  if (dropdown !== null) {
    dropdown.classList.remove("open");
  }
  const chip = queryById<HTMLButtonElement>("wallet-chip-dash");
  if (chip !== null) {
    chip.setAttribute("aria-expanded", "false");
  }
}

/** Default label on the dashboard wallet copy control. */
const WALLET_COPY_LABEL = "Copy address";

/**
 * Dashboard wallet chip: dropdown with full address and disconnect.
 */
function setupWalletDropdown(): void {
  const chip = queryById<HTMLButtonElement>("wallet-chip-dash");
  const dropdown = queryById<HTMLElement>("wallet-dropdown-dash");
  const copyBtn = queryById<HTMLButtonElement>("btn-wallet-copy-address");
  const disconnectBtn = queryById<HTMLButtonElement>("btn-wallet-disconnect");
  if (chip === null || dropdown === null) {
    return;
  }

  chip.addEventListener("click", (event) => {
    event.stopPropagation();
    const willOpen = !dropdown.classList.contains("open");
    closeWalletDropdown();
    if (willOpen) {
      updateWalletDropdownAddress();
      if (copyBtn !== null) {
        copyBtn.textContent = WALLET_COPY_LABEL;
      }
      dropdown.classList.add("open");
      chip.setAttribute("aria-expanded", "true");
    }
  });

  if (copyBtn !== null) {
    copyBtn.addEventListener("click", () => {
      const id = getConnectedAccountId();
      const fullAddress = id === null ? "" : id.trim();
      if (fullAddress.length === 0) {
        return;
      }
      void (async () => {
        try {
          await navigator.clipboard.writeText(fullAddress);
          copyBtn.textContent = "Copied";
          window.setTimeout(() => {
            copyBtn.textContent = WALLET_COPY_LABEL;
          }, 1500);
        } catch {
          /* clipboard unavailable */
        }
      })();
    });
  }

  if (disconnectBtn !== null) {
    disconnectBtn.addEventListener("click", () => {
      connectedViaExtension = false;
      clearConnectedAccount();
      closeWalletDropdown();
      setVaultMessage("", false);
      setConnectError("");
      showScreen("connect");
    });
  }

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    if (target.closest(".wallet-chip-wrap")) {
      return;
    }
    closeWalletDropdown();
  });
}

/**
 * Shortens a Miden account id for nav chips: first 8 characters, ellipsis, last 4.
 */
function truncateAccountIdChip(full: string): string {
  const trimmed = full.trim();
  if (trimmed.length === 0) {
    return "";
  }
  const withPrefix = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  if (withPrefix.length <= 14) {
    return withPrefix;
  }
  return `${withPrefix.slice(0, 8)}...${withPrefix.slice(-4)}`;
}

/**
 * Shortens a Miden account id on the dashboard welcome line: first 10, last 6.
 */
function truncateAccountIdDashboard(full: string): string {
  const trimmed = full.trim();
  if (trimmed.length === 0) {
    return "";
  }
  const withPrefix = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  if (withPrefix.length <= 18) {
    return withPrefix;
  }
  return `${withPrefix.slice(0, 10)}...${withPrefix.slice(-6)}`;
}

/**
 * Writes the connected account id into every wallet chip on all screens.
 */
function updateWalletChips(): void {
  const id = getConnectedAccountId();
  const label = id === null || id.length === 0 ? "" : truncateAccountIdChip(id);
  const chips: readonly string[] = [
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
  updateDashboardWelcome();
  updateWalletDropdownAddress();
}

/**
 * Fills the dashboard wallet dropdown with the full account id for viewing and copy.
 */
function updateWalletDropdownAddress(): void {
  const addrEl = queryById<HTMLElement>("wallet-dropdown-dash-addr");
  if (addrEl === null) {
    return;
  }
  const id = getConnectedAccountId();
  addrEl.textContent = id === null || id.trim().length === 0 ? "" : id.trim();
}

/**
 * Shows the full connected wallet id on the dashboard welcome line.
 */
function updateDashboardWelcome(): void {
  const el = queryById<HTMLElement>("dashboard-wallet-id");
  if (el === null) {
    return;
  }
  const id = getConnectedAccountId();
  if (id === null || id.trim().length === 0) {
    el.textContent = "not connected";
    return;
  }
  el.textContent = truncateAccountIdDashboard(id);
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
  menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    document.querySelectorAll(".ndrawer.open").forEach((openDrawer) => {
      if (openDrawer !== drawer) {
        openDrawer.classList.remove("open");
      }
    });
    drawer.classList.toggle("open");
  });
  drawer.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof Element)) {
      return;
    }
    if (target.closest("a") !== null || target.closest("button") !== null) {
      drawer.classList.remove("open");
    }
  });
}

/** Pairs each app screen hamburger button id with its mobile drawer id (see app.html). */
const APP_MENU_DRAWER_PAIRS: ReadonlyArray<[string, string]> = [
  ["menuBtnConnect", "ndrawerConnect"],
  ["menuBtnDash", "ndrawerDash"],
  ["menuBtnCreate", "ndrawerCreate"],
];

/**
 * Registers all hamburger menu pairs for the three app screens.
 */
function setupMobileMenus(): void {
  for (const [menuId, drawerId] of APP_MENU_DRAWER_PAIRS) {
    setupDrawerToggle(menuId, drawerId);
  }
}

/**
 * Shows a message under the connect hero, or hides it when text is empty.
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

/** Alias used by the Miden extension connect path for user-facing errors. */
function showConnectError(message: string): void {
  setConnectError(message);
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

/** Shown while createVault is proving and submitting on testnet (1-3 minutes). */
const VAULT_CREATE_PENDING_MESSAGE =
  "Creating vault on Miden testnet. ZK proof is being generated. This takes 1-3 minutes. Please wait...";

const VAULT_SUBMIT_BUTTON_LABEL = "Create Vault";
const VAULT_SUBMIT_BUTTON_LOADING_LABEL = "Creating...";

/**
 * Disables the submit button and shows a loading label while createVault runs.
 */
function setVaultSubmitButtonLoading(loading: boolean): void {
  const btn = queryById<HTMLButtonElement>("btn-vault-submit");
  if (btn === null) {
    return;
  }
  btn.disabled = loading;
  btn.textContent = loading
    ? VAULT_SUBMIT_BUTTON_LOADING_LABEL
    : VAULT_SUBMIT_BUTTON_LABEL;
}

/**
 * Shows or hides the in-progress message under the create vault form.
 */
function setVaultCreateStatus(message: string): void {
  const el = queryById<HTMLElement>("form-status");
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
        idSpan.textContent = truncateAccountIdChip(vaultId);
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
    if (isPrivateAccountLookupError(err)) {
      emptyEl.removeAttribute("hidden");
      setVaultMessage("", false);
      return;
    }
    emptyEl.setAttribute("hidden", "");
    const message =
      err instanceof Error ? err.message : "Could not load your vault list.";
    setVaultMessage(message, true);
  }
}

/**
 * Persists the account id, refreshes UI, opens the dashboard, and loads vaults.
 */
async function finishConnectWithAccountId(accountId: string): Promise<void> {
  if (!connectedViaExtension) {
    await initClient();
  }
  setConnectedAccountId(accountId);
  updateWalletChips();
  showScreen("dashboard");
  setVaultMessage("", false);
  if (!connectedViaExtension) {
    await loadUserVaults();
  }
}

/**
 * Reads account id from the extension object after connect().
 */
function readMidenWalletAccountId(wallet: {
  address?: string;
  permission?: { address?: string };
}): string {
  if (typeof wallet.address === "string" && wallet.address.trim().length > 0) {
    return wallet.address.trim();
  }
  const fromPermission = wallet.permission?.address;
  if (
    typeof fromPermission === "string" &&
    fromPermission.trim().length > 0
  ) {
    return fromPermission.trim();
  }
  return "";
}

/**
 * Connects through `window.midenWallet` when the Miden Wallet extension is present.
 */
async function handleConnectWalletExtension(): Promise<void> {
  const w = window as {
    midenWallet?: {
      connect?: (permission: string, network: string) => Promise<unknown>;
      address?: string;
      permission?: { address?: string };
      network?: unknown;
      appName?: string;
    };
  };
  if (w.midenWallet && typeof w.midenWallet.connect === "function") {
    try {
      await w.midenWallet.connect("UPON_REQUEST", "testnet");
      const accountId = readMidenWalletAccountId(w.midenWallet);
      if (accountId.length > 0) {
        connectedViaExtension = true;
        await finishConnectWithAccountId(accountId);
        return;
      }
      showConnectError(
        "Wallet did not return an account id. Use manual entry below."
      );
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showConnectError("Wallet connection failed: " + msg);
      return;
    }
  }
  showConnectError(
    "Miden Wallet extension not detected. Install it from the Chrome Web Store or use your account ID below."
  );
}

/**
 * Runs the extension connect flow and restores the primary button label.
 */
async function runExtensionConnectWithButton(
  button: HTMLButtonElement
): Promise<void> {
  const originalHtml = button.innerHTML;
  button.disabled = true;
  button.textContent = "Connecting...";
  setConnectError("");
  try {
    await handleConnectWalletExtension();
  } finally {
    button.disabled = false;
    button.innerHTML = originalHtml;
  }
}

/**
 * Uses the manual account id field and the same post-connect steps as the extension path.
 */
async function handleManualAccountConnect(
  button: HTMLButtonElement
): Promise<void> {
  const input = queryById<HTMLInputElement>("connect-account-id");
  const originalHtml = button.innerHTML;
  button.disabled = true;
  button.textContent = "Connecting...";
  setConnectError("");
  try {
    if (input === null) {
      setConnectError(
        "The connect form is incomplete. Please refresh the page."
      );
      return;
    }
    const trimmed = input.value.trim();
    if (trimmed.length === 0) {
      setConnectError(
        "Enter your Miden account id in the field above, then tap Connect with Account ID."
      );
      return;
    }
    connectedViaExtension = false;
    await finishConnectWithAccountId(trimmed);
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
 * Wires the primary extension button and manual connect.
 */
function setupConnectButtons(): void {
  const extBtn = queryById<HTMLButtonElement>("btn-connect-miden-extension");
  if (extBtn !== null) {
    extBtn.addEventListener("click", () => {
      void runExtensionConnectWithButton(extBtn);
    });
  }
  const accountIdBtn = queryById<HTMLButtonElement>("btn-connect-account-id");
  if (accountIdBtn !== null) {
    accountIdBtn.addEventListener("click", () => {
      void handleManualAccountConnect(accountIdBtn);
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
    "btn-create-vault-empty",
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
      setVaultCreateStatus("");
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
    setVaultCreateStatus("");
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
      setVaultCreateStatus(VAULT_CREATE_PENDING_MESSAGE);
      setVaultSubmitButtonLoading(true);
      const recipientInput = queryById<HTMLInputElement>("recipient");
      const intervalInput = queryById<HTMLInputElement>("interval");
      const amountInput = queryById<HTMLInputElement>("amount");
      if (
        recipientInput === null ||
        intervalInput === null ||
        amountInput === null
      ) {
        setVaultCreateStatus("");
        setVaultSubmitButtonLoading(false);
        setFormError("The form is missing required fields. Please refresh the page.");
        return;
      }
      const recipient = recipientInput.value.trim();
      const interval = Number(intervalInput.value.trim());
      const amount = Number(amountInput.value.trim());
      try {
        await createVault(recipient, interval, amount);
        setVaultCreateStatus("");
        setFormError("");
        setVaultSubmitButtonLoading(false);
        showScreen("dashboard");
        setVaultMessage("Vault created successfully", true);
        if (!connectedViaExtension) {
          await loadUserVaults();
        }
      } catch (err) {
        setVaultCreateStatus("");
        setVaultSubmitButtonLoading(false);
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
  setupMobileMenus();
  setupWalletDropdown();
  setupConnectButtons();
  setupCreateVaultButtons();
  setupCancelButton();
  setupVaultFormSubmit();
  setupVaultListDelegation();
}

/**
 * Picks connect vs dashboard from saved account id (does not init MidenClient on load).
 */
async function bootstrap(): Promise<void> {
  setConnectError("");
  setFormError("");
  setVaultCreateStatus("");
  setVaultMessage("", false);
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
  if (savedAccountReady) {
    updateWalletChips();
    showScreen("dashboard");
  } else {
    showScreen("connect");
  }
}

/**
 * Runs init when the DOM is ready. Module scripts often load after DOMContentLoaded
 * has already fired, so a listener alone would never run.
 */
function runWhenDocumentReady(run: () => void): void {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
    return;
  }
  run();
}

/**
 * Wires theme, handlers, and initial screen after the document is interactive.
 */
function initApp(): void {
  applySavedTheme();

  document.addEventListener("click", (e: MouseEvent) => {
    const target = e.target;
    if (!(target instanceof Element)) {
      return;
    }
    if (
      target.closest("#themeBtnConnect") ||
      target.closest("#themeBtnDash") ||
      target.closest("#themeBtnCreate") ||
      target.closest(".btn-theme")
    ) {
      document.body.classList.toggle("light");
      const theme = document.body.classList.contains("light")
        ? THEME_LIGHT
        : THEME_DARK;
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
      }
    }
  });

  setConnectError("");
  setFormError("");
  setVaultCreateStatus("");
  setVaultMessage("", false);
  setupAllHandlers();
  void bootstrap();
}

runWhenDocumentReady(initApp);

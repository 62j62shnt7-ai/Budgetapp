/**
 * Displays a non-intrusive modal dialog asking the user to confirm an action.
 * Returns a Promise resolving to true if confirmed, false otherwise.
 */
export function confirmAction(title, message, confirmButtonText = "Delete") {
  return new Promise((resolve) => {
    const dialog = document.getElementById("confirmDialog");
    if (!dialog) {
      // Fallback to window.confirm if dialog element doesn't exist
      resolve(window.confirm(`${title}\n\n${message}`));
      return;
    }

    const titleEl = document.getElementById("confirmTitle");
    const messageEl = document.getElementById("confirmMessage");
    const confirmBtn = document.getElementById("confirmOkButton");
    const cancelBtn = document.getElementById("confirmCancelButton");

    if (titleEl) titleEl.textContent = title;
    if (messageEl) messageEl.textContent = message;
    if (confirmBtn) confirmBtn.textContent = confirmButtonText;

    const handleClose = () => {
      dialog.removeEventListener("close", handleClose);
      resolve(dialog.returnValue === "confirm");
    };

    dialog.addEventListener("close", handleClose);
    dialog.showModal();
  });
}

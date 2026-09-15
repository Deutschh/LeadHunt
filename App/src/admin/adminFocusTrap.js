const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function getFocusableElements(container) {
  if (!container?.querySelectorAll) return [];
  return [...container.querySelectorAll(FOCUSABLE_SELECTOR)].filter(
    (element) =>
      !element.hidden &&
      element.getAttribute("aria-hidden") !== "true" &&
      element.tabIndex >= 0,
  );
}

export function getTrappedFocusTarget(elements, activeElement, shiftKey) {
  if (!elements.length) return null;
  const currentIndex = elements.indexOf(activeElement);
  if (shiftKey) {
    return currentIndex <= 0 ? elements[elements.length - 1] : null;
  }
  return currentIndex === -1 || currentIndex === elements.length - 1
    ? elements[0]
    : null;
}

export function isolateApplicationRoot(root) {
  if (!root) return () => undefined;
  const previousInert = root.inert;
  const previousAriaHidden = root.getAttribute("aria-hidden");
  root.inert = true;
  root.setAttribute("aria-hidden", "true");
  return () => {
    root.inert = previousInert;
    if (previousAriaHidden === null) root.removeAttribute("aria-hidden");
    else root.setAttribute("aria-hidden", previousAriaHidden);
  };
}

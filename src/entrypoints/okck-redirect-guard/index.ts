function isBlockedRedirectListener(
  listener: EventListenerOrEventListenerObject
): boolean {
  const source =
    typeof listener === 'function'
      ? listener.toString()
      : typeof listener.handleEvent === 'function'
        ? listener.handleEvent.toString()
        : '';

  return source.includes('kr3s7');
}

export default defineContentScript({
  registration: 'runtime',
  main() {
    const originalAddEventListener = Document.prototype.addEventListener;

    Document.prototype.addEventListener = function addEventListenerPatched(
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | AddEventListenerOptions
    ): void {
      if (
        type === 'DOMContentLoaded' &&
        listener &&
        isBlockedRedirectListener(listener)
      ) {
        return;
      }

      originalAddEventListener.call(this, type, listener, options);
    };
  }
});

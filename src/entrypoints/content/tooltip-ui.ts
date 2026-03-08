import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createIntegratedUi } from 'wxt/utils/content-script-ui/integrated';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';

import type { DecodeMap } from '@/lib/types';
import { filterTranslatableGlyphChars } from '@/entrypoints/content/glyph';
import { Tooltip, type TooltipState } from '@/entrypoints/content/Tooltip';

interface TooltipMounted {
  root: Root;
  updateState: (updater: (prev: TooltipState) => TooltipState) => void;
  contains: (target: EventTarget | null) => boolean;
  shouldIgnoreSelectionCheck: () => boolean;
  focusInput: () => void;
}

export interface TooltipUi {
  show: (selectionText: string, rect: DOMRect) => void;
  hide: () => void;
  contains: (target: EventTarget | null) => boolean;
  shouldIgnoreSelectionCheck: () => boolean;
}

function createInitialTooltipState(): TooltipState {
  return {
    visible: false,
    left: 8,
    top: 8,
    selectedText: '',
    inputValue: '',
    error: ''
  };
}

function navigateToSearchPage(rootUrl: string, query: string): void {
  const destinationUrl = new URL(rootUrl);
  destinationUrl.searchParams.set('s', query);
  const destination = destinationUrl.toString();

  try {
    if (window.top && window.top !== window) {
      window.top.location.href = destination;
      return;
    }
  } catch {
    // Ignore cross-origin access errors and fallback to current frame.
  }

  window.location.href = destination;
}

function createDecodeEntries(
  sourceChars: string[],
  inputValue: string
): DecodeMap {
  if (sourceChars.length === 0) {
    return {};
  }

  if (sourceChars.length === 1) {
    const [source] = sourceChars;
    return source && inputValue.length > 0 ? { [source]: inputValue } : {};
  }

  const targetChars = Array.from(inputValue);
  if (targetChars.length !== sourceChars.length) {
    return {};
  }

  return sourceChars.reduce<DecodeMap>((entries, source, index) => {
    const target = targetChars[index];
    if (target) {
      entries[source] = target;
    }

    return entries;
  }, {});
}

export function createTooltipUi(
  ctx: ContentScriptContext,
  onSubmitMappings: (entries: DecodeMap) => Promise<void>,
  decodeSelectionText: (text: string) => string,
  getSearchRootUrl: () => string | null
): TooltipUi {
  const ui = createIntegratedUi<TooltipMounted>(ctx, {
    position: 'overlay',
    anchor: 'body',
    append: 'last',
    onMount(wrapper) {
      const root = createRoot(wrapper);
      let inputElement: HTMLInputElement | null = null;
      let isComposing = false;
      let isInputFocused = false;
      let state = createInitialTooltipState();

      function render(): void {
        root.render(
          createElement(Tooltip, {
            state,
            onInputRef: (node: HTMLInputElement | null) => {
              inputElement = node;
            },
            onInputChange: (value: string) => {
              state = {
                ...state,
                inputValue: value,
                error: ''
              };
              render();
            },
            onCompositionStart: () => {
              isComposing = true;
            },
            onCompositionEnd: () => {
              isComposing = false;
            },
            onInputFocus: () => {
              isInputFocused = true;
            },
            onInputBlur: () => {
              isInputFocused = false;
            },
            onCopySelected: () => {
              void (async () => {
                try {
                  await navigator.clipboard.writeText(state.selectedText);
                  state = {
                    ...state,
                    visible: false,
                    selectedText: '',
                    inputValue: '',
                    error: ''
                  };
                } catch {
                  state = {
                    ...state,
                    error: 'コピーに失敗しました。'
                  };
                }
                render();
              })();
            },
            onCopyDecoded: () => {
              void (async () => {
                try {
                  const decoded = decodeSelectionText(state.selectedText);
                  await navigator.clipboard.writeText(decoded);
                  state = {
                    ...state,
                    visible: false,
                    selectedText: '',
                    inputValue: '',
                    error: ''
                  };
                } catch {
                  state = {
                    ...state,
                    error: 'コピーに失敗しました。'
                  };
                }
                render();
              })();
            },
            onSearch: () => {
              const query = state.selectedText;
              if (!query) {
                return;
              }

              const rootUrl = getSearchRootUrl();
              if (!rootUrl) {
                return;
              }

              navigateToSearchPage(rootUrl, query);
              state = {
                ...state,
                visible: false,
                selectedText: '',
                inputValue: '',
                error: ''
              };
              render();
            },
            onSubmit: () => {
              void (async () => {
                const sourceChars = filterTranslatableGlyphChars(
                  state.selectedText
                );

                if (sourceChars.length === 0) {
                  state = {
                    ...state,
                    visible: false,
                    selectedText: '',
                    inputValue: '',
                    error: ''
                  };
                  render();
                  return;
                }

                if (
                  sourceChars.length > 1 &&
                  Array.from(state.inputValue).length !== sourceChars.length
                ) {
                  state = {
                    ...state,
                    error: '入力文字数は選択文字数と同じにしてください'
                  };
                  render();
                  return;
                }

                const entries = createDecodeEntries(
                  sourceChars,
                  state.inputValue
                );

                if (Object.keys(entries).length === 0) {
                  state = {
                    ...state,
                    visible: false,
                    selectedText: '',
                    inputValue: '',
                    error: ''
                  };
                  render();
                  return;
                }

                await onSubmitMappings(entries);
                state = {
                  ...state,
                  visible: false,
                  selectedText: '',
                  inputValue: '',
                  error: ''
                };
                render();
              })();
            }
          })
        );
      }

      render();

      return {
        root,
        updateState(updater) {
          state = updater(state);
          render();
        },
        contains(target) {
          return target instanceof Node && wrapper.contains(target);
        },
        shouldIgnoreSelectionCheck() {
          return isComposing || isInputFocused;
        },
        focusInput() {
          window.setTimeout(() => {
            inputElement?.focus();
          }, 0);
        }
      };
    },
    onRemove(mounted) {
      mounted?.root.unmount();
    }
  });

  ui.mount();

  return {
    show(selectionText: string, rect: DOMRect) {
      const mounted = ui.mounted;
      if (!mounted) {
        return;
      }

      mounted.updateState((prev) => ({
        ...prev,
        visible: true,
        selectedText: selectionText,
        inputValue: '',
        error: '',
        left: Math.min(window.innerWidth - 320, Math.max(8, rect.left)),
        top: Math.min(window.innerHeight - 100, Math.max(8, rect.bottom + 8))
      }));
      mounted.focusInput();
    },
    hide() {
      ui.mounted?.updateState((prev) => ({
        ...prev,
        visible: false,
        selectedText: '',
        inputValue: '',
        error: ''
      }));
    },
    contains(target: EventTarget | null) {
      return ui.mounted?.contains(target) ?? false;
    },
    shouldIgnoreSelectionCheck() {
      return ui.mounted?.shouldIgnoreSelectionCheck() ?? false;
    }
  };
}

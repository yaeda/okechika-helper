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

export function createTooltipUi(
  ctx: ContentScriptContext,
  onSubmitMappings: (entries: DecodeMap) => Promise<void>
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
            onSubmit: () => {
              void (async () => {
                const sourceChars = filterTranslatableGlyphChars(state.selectedText);
                const targetChars = Array.from(state.inputValue);

                if (targetChars.length !== sourceChars.length) {
                  state = {
                    ...state,
                    error: '入力文字数は選択文字数と同じにしてください'
                  };
                  render();
                  return;
                }

                const entries: DecodeMap = {};
                targetChars.forEach((target, index) => {
                  const source = sourceChars[index];
                  if (source) {
                    entries[source] = target;
                  }
                });

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

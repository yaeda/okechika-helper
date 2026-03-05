import type { FormEvent } from 'react';

export interface TooltipState {
  visible: boolean;
  left: number;
  top: number;
  selectedText: string;
  inputValue: string;
  error: string;
}

interface TooltipProps {
  state: TooltipState;
  onSubmit: () => void;
  onInputChange: (value: string) => void;
  onCompositionStart: () => void;
  onCompositionEnd: () => void;
  onInputFocus: () => void;
  onInputBlur: () => void;
  onInputRef: (node: HTMLInputElement | null) => void;
}

export function Tooltip(props: TooltipProps) {
  const { state } = props;

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    props.onSubmit();
  }

  return (
    <div
      id="okechika-tooltip"
      style={{
        left: `${state.left}px`,
        top: `${state.top}px`,
        display: state.visible ? 'block' : 'none'
      }}
    >
      <div className="okechika-caption">
        Selected:{' '}
        <span className="okechika-selected-unknown">{state.selectedText}</span>
        （<span className="okechika-selected-normal">{state.selectedText}</span>
        ）
      </div>

      <form className="okechika-form" onSubmit={handleSubmit}>
        <div className="okechika-input-col">
          <input
            ref={props.onInputRef}
            value={state.inputValue}
            placeholder="対応文字を入力"
            onChange={(event) => {
              props.onInputChange(event.currentTarget.value);
            }}
            onCompositionStart={props.onCompositionStart}
            onCompositionEnd={props.onCompositionEnd}
            onFocus={props.onInputFocus}
            onBlur={props.onInputBlur}
          />
          <div className="okechika-error">{state.error}</div>
        </div>
        <button type="submit">Save</button>
      </form>
    </div>
  );
}

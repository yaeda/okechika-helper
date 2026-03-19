import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import '@/components/conversion-table-panel.css';
import {
  OKECHIKA_CHARS,
  OKECHIKA_NUMBER_CHARS,
  OKECHIKA_TEXT_CHARS
} from '@/lib/okechika-chars';
import { DEFAULT_OPTIONS_UI_STATE, setMappings } from '@/lib/storage';
import type {
  DecodeMap,
  DecodeTable,
  OptionsTableDisplayMode
} from '@/lib/types';

function joinClassNames(
  ...names: Array<string | undefined>
): string | undefined {
  const filtered = names.filter(Boolean);
  return filtered.length > 0 ? filtered.join(' ') : undefined;
}

function formatUpdatedAt(value: string | null): string {
  if (!value) {
    return '未更新';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function ScrollableTableWrap({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasLeftFade, setHasLeftFade] = useState(false);
  const [hasRightFade, setHasRightFade] = useState(false);

  useEffect(() => {
    function updateFadeVisibility(): void {
      const element = containerRef.current;
      if (!element) {
        return;
      }

      const maxScrollLeft = Math.max(
        0,
        element.scrollWidth - element.clientWidth
      );
      setHasLeftFade(element.scrollLeft > 0);
      setHasRightFade(element.scrollLeft < maxScrollLeft - 1);
    }

    updateFadeVisibility();

    const element = containerRef.current;
    if (!element) {
      return;
    }

    element.addEventListener('scroll', updateFadeVisibility, { passive: true });

    const resizeObserver = new ResizeObserver(() => {
      updateFadeVisibility();
    });
    resizeObserver.observe(element);
    const firstChild = element.firstElementChild;
    if (firstChild) {
      resizeObserver.observe(firstChild);
    }

    window.addEventListener('resize', updateFadeVisibility);

    return () => {
      element.removeEventListener('scroll', updateFadeVisibility);
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateFadeVisibility);
    };
  }, []);

  return (
    <div
      className={joinClassNames(
        'conversion-table-wrap',
        className,
        hasLeftFade ? 'has-left-fade' : undefined,
        hasRightFade ? 'has-right-fade' : undefined
      )}
    >
      <div ref={containerRef} className="conversion-table-wrap-scroll">
        <div className="conversion-table-wrap-frame">{children}</div>
      </div>
    </div>
  );
}

function renderEditableTarget(target: string): JSX.Element {
  return (
    <span
      className={joinClassNames(
        'conversion-table-editable-target',
        target === '?' ? 'conversion-table-is-unknown' : undefined
      )}
    >
      {target}
    </span>
  );
}

export function ConversionTablePanel({
  table,
  useSourceGlyphFont,
  onToggleSourceGlyphFont,
  highlightSelectedText,
  onToggleHighlightSelectedText,
  showHighlightToggle = true,
  displayMode,
  onDisplayModeChange,
  statusContent,
  highlightedSources,
  highlightRequestId,
  isVisible = true
}: {
  table: DecodeTable;
  useSourceGlyphFont: boolean;
  onToggleSourceGlyphFont: (checked: boolean) => void | Promise<void>;
  highlightSelectedText?: boolean;
  onToggleHighlightSelectedText?: (checked: boolean) => void | Promise<void>;
  showHighlightToggle?: boolean;
  displayMode?: OptionsTableDisplayMode;
  onDisplayModeChange?: (nextMode: OptionsTableDisplayMode) => void;
  statusContent?: ReactNode;
  highlightedSources?: string[];
  highlightRequestId?: string | null;
  isVisible?: boolean;
}) {
  const [localTable, setLocalTable] = useState(table);
  const [inlineEditError, setInlineEditError] = useState('');
  const [editingCell, setEditingCell] = useState<{
    source: string;
    draft: string;
    cellKey: string;
  } | null>(null);
  const [internalDisplayMode, setInternalDisplayMode] =
    useState<OptionsTableDisplayMode>(
      DEFAULT_OPTIONS_UI_STATE.tableDisplayMode
    );
  const skipBlurCommitRef = useRef(false);
  const sourceCellRefs = useRef(new Map<string, HTMLTableCellElement>());

  useEffect(() => {
    setLocalTable(table);
  }, [table]);

  const activeDisplayMode = displayMode ?? internalDisplayMode;

  const glyphSections = useMemo(() => {
    const mappings = localTable.mappings ?? {};
    const baseCells = OKECHIKA_TEXT_CHARS.map((source) => ({
      source,
      target: mappings[source] ?? '?'
    }));
    const numberLikeCells = OKECHIKA_NUMBER_CHARS.map((source) => ({
      source,
      target: mappings[source] ?? '?'
    }));

    function toRows(source: Array<{ source: string; target: string }>) {
      const chunked: Array<Array<{ source: string; target: string }>> = [];
      for (let i = 0; i < source.length; i += 20) {
        chunked.push(source.slice(i, i + 20));
      }
      return chunked;
    }

    return {
      baseRows: toRows(baseCells),
      numberLikeRows: toRows(numberLikeCells)
    };
  }, [localTable]);

  const decodeProgress = useMemo(() => {
    const mappings = localTable.mappings ?? {};
    const total = OKECHIKA_CHARS.length;
    const decoded = OKECHIKA_CHARS.reduce((count, source) => {
      const target = mappings[source];
      return target && target !== '?' ? count + 1 : count;
    }, 0);
    const percent = total === 0 ? 0 : (decoded / total) * 100;

    return {
      decoded,
      total,
      percent
    };
  }, [localTable]);

  const otherMappings = useMemo(() => {
    const mappings = localTable.mappings ?? {};
    const defined = new Set(OKECHIKA_CHARS);
    return Object.entries(mappings)
      .filter(([source]) => !defined.has(source))
      .sort(([a], [b]) =>
        a.localeCompare(b, undefined, { sensitivity: 'base' })
      );
  }, [localTable]);

  const highlightedSourceSet = useMemo(
    () => new Set(highlightedSources ?? []),
    [highlightedSources]
  );

  const firstHighlightedSource = highlightedSources?.[0] ?? null;

  function handleSelectDisplayMode(nextMode: OptionsTableDisplayMode): void {
    if (displayMode === undefined) {
      setInternalDisplayMode(nextMode);
    }
    onDisplayModeChange?.(nextMode);
  }

  function bindSourceCellRef(source: string) {
    return (node: HTMLTableCellElement | null): void => {
      if (node) {
        sourceCellRefs.current.set(source, node);
        return;
      }

      sourceCellRefs.current.delete(source);
    };
  }

  function startInlineEdit(
    source: string,
    currentTarget: string,
    cellKey: string
  ): void {
    setInlineEditError('');
    setEditingCell({
      source,
      draft: currentTarget === '?' ? '' : currentTarget,
      cellKey
    });
  }

  function cancelInlineEdit(): void {
    setEditingCell(null);
  }

  async function commitInlineEdit(
    source: string,
    draft: string
  ): Promise<void> {
    const currentValue = localTable.mappings[source] ?? '';
    const shouldDelete = draft === '' || draft === '?';
    if (shouldDelete && currentValue === '') {
      setEditingCell(null);
      return;
    }
    if (!shouldDelete && draft === currentValue) {
      setEditingCell(null);
      return;
    }

    const nextMappings: DecodeMap = { ...localTable.mappings };
    if (shouldDelete) {
      delete nextMappings[source];
    } else {
      nextMappings[source] = draft;
    }

    setEditingCell(null);
    setInlineEditError('');
    setLocalTable({
      mappings: nextMappings,
      updatedAt: new Date().toISOString()
    });

    try {
      await setMappings(nextMappings);
    } catch {
      setInlineEditError(
        'セル編集の保存に失敗しました。もう一度お試しください。'
      );
    }
  }

  function renderCellEditor(source: string, cellKey: string): JSX.Element {
    if (editingCell?.source === source && editingCell.cellKey === cellKey) {
      return (
        <input
          className="conversion-table-cell-edit-input"
          size={1}
          value={editingCell.draft}
          onChange={(event) => {
            const nextDraft = event.currentTarget.value;
            setEditingCell((prev) => {
              if (!prev || prev.source !== source || prev.cellKey !== cellKey) {
                return prev;
              }
              return {
                ...prev,
                draft: nextDraft
              };
            });
          }}
          onBlur={() => {
            if (skipBlurCommitRef.current) {
              skipBlurCommitRef.current = false;
              return;
            }
            void commitInlineEdit(source, editingCell.draft);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void commitInlineEdit(source, editingCell.draft);
              return;
            }

            if (event.key === 'Escape') {
              event.preventDefault();
              skipBlurCommitRef.current = true;
              cancelInlineEdit();
            }
          }}
          autoFocus
        />
      );
    }

    return <></>;
  }

  function renderGlyphCell(source: string, target: string): JSX.Element {
    const isEditing =
      editingCell?.source === source && editingCell.cellKey === source;
    const isHighlighted = highlightedSourceSet.has(source);

    return (
      <td
        key={source}
        ref={bindSourceCellRef(source)}
        className={joinClassNames(
          'conversion-table-glyph-cell',
          'conversion-table-is-editable',
          isHighlighted ? 'conversion-table-cell-highlighted' : undefined
        )}
        onDoubleClick={() => startInlineEdit(source, target, source)}
        title="ダブルクリックで編集"
      >
        {isEditing ? renderCellEditor(source, source) : null}
        {isEditing || activeDisplayMode !== 'source' ? null : (
          <span
            className={joinClassNames(
              useSourceGlyphFont ? 'conversion-table-source-glyph' : undefined,
              target === '?' ? 'conversion-table-is-unknown' : undefined
            )}
          >
            {source}
          </span>
        )}
        {isEditing || activeDisplayMode !== 'target'
          ? null
          : renderEditableTarget(target)}
        {isEditing || activeDisplayMode !== 'both' ? null : (
          <span className="conversion-table-glyph-pair">
            <span
              className={joinClassNames(
                useSourceGlyphFont
                  ? 'conversion-table-source-glyph'
                  : undefined,
                target === '?' ? 'conversion-table-is-unknown' : undefined
              )}
            >
              {source}
            </span>
            <span
              className={joinClassNames(
                'conversion-table-glyph-divider',
                target === '?' ? 'conversion-table-is-unknown' : undefined
              )}
            >
              {'>'}
            </span>
            {renderEditableTarget(target)}
          </span>
        )}
      </td>
    );
  }

  useEffect(() => {
    if (!isVisible || !firstHighlightedSource || !highlightRequestId) {
      return;
    }

    const targetCell = sourceCellRefs.current.get(firstHighlightedSource);
    if (!targetCell) {
      return;
    }

    const rafId = window.requestAnimationFrame(() => {
      targetCell.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center'
      });
    });

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [firstHighlightedSource, highlightRequestId, isVisible]);

  return (
    <div className="conversion-table-panel">
      <p className="conversion-table-caption">
        最終更新日: {formatUpdatedAt(localTable.updatedAt)}
      </p>
      {statusContent}
      {inlineEditError ? (
        <p className="conversion-table-caption is-error">{inlineEditError}</p>
      ) : null}
      <p className="conversion-table-caption">
        セルをダブルクリックすると、そのセルを直接編集できます。
      </p>

      <div className="conversion-table-display-row">
        <p className="conversion-table-progress">
          解析進捗: {decodeProgress.decoded}/{decodeProgress.total}（
          {decodeProgress.percent.toFixed(1)}%）
        </p>
        <div className="conversion-table-display-controls">
          <label className="conversion-table-source-font-toggle">
            <input
              type="checkbox"
              checked={useSourceGlyphFont}
              onChange={(event) => {
                void onToggleSourceGlyphFont(event.currentTarget.checked);
              }}
            />
            <span>変換前に桶地下フォントを適用</span>
          </label>
          {showHighlightToggle ? (
            <label className="conversion-table-source-font-toggle">
              <input
                type="checkbox"
                checked={highlightSelectedText ?? false}
                onChange={(event) => {
                  void onToggleHighlightSelectedText?.(
                    event.currentTarget.checked
                  );
                }}
              />
              <span>選択した文字をハイライトする</span>
            </label>
          ) : null}
          <div className="conversion-table-display-mode-group">
            <button
              type="button"
              className={joinClassNames(
                'conversion-table-button',
                activeDisplayMode === 'source' ? 'is-active' : undefined
              )}
              onClick={() => handleSelectDisplayMode('source')}
            >
              変換前
            </button>
            <button
              type="button"
              className={joinClassNames(
                'conversion-table-button',
                activeDisplayMode === 'target' ? 'is-active' : undefined
              )}
              onClick={() => handleSelectDisplayMode('target')}
            >
              変換後
            </button>
            <button
              type="button"
              className={joinClassNames(
                'conversion-table-button',
                activeDisplayMode === 'both' ? 'is-active' : undefined
              )}
              onClick={() => handleSelectDisplayMode('both')}
            >
              両方表示
            </button>
          </div>
        </div>
      </div>

      <ScrollableTableWrap className="is-fill">
        <table className="conversion-table-grid">
          <tbody>
            {glyphSections.baseRows.map((row, rowIndex) => (
              <tr key={`glyph-row-${rowIndex}`}>
                {row.map(({ source, target }) =>
                  renderGlyphCell(source, target)
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollableTableWrap>

      {glyphSections.numberLikeRows.length > 0 ? (
        <ScrollableTableWrap className="is-fill is-second">
          <table className="conversion-table-grid">
            <tbody>
              {glyphSections.numberLikeRows.map((row, rowIndex) => (
                <tr key={`glyph-number-row-${rowIndex}`}>
                  {row.map(({ source, target }) =>
                    renderGlyphCell(source, target)
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollableTableWrap>
      ) : null}

      <h3 className="conversion-table-subsection-title">その他の文字</h3>
      {otherMappings.length === 0 ? (
        <p className="conversion-table-caption">該当する文字はありません。</p>
      ) : (
        <ScrollableTableWrap className="is-compact">
          <table className="conversion-table-grid conversion-table-grid-compact">
            <thead>
              <tr>
                <th>変換前</th>
                <th>変換後</th>
              </tr>
            </thead>
            <tbody>
              {otherMappings.map(([source, target]) => (
                <tr key={`other-${source}`}>
                  <td
                    ref={bindSourceCellRef(source)}
                    className={joinClassNames(
                      'conversion-table-is-editable',
                      highlightedSourceSet.has(source)
                        ? 'conversion-table-cell-highlighted'
                        : undefined,
                      useSourceGlyphFont
                        ? 'conversion-table-source-glyph'
                        : undefined,
                      target === '?' ? 'conversion-table-is-unknown' : undefined
                    )}
                    onDoubleClick={() =>
                      startInlineEdit(source, target, `other-source-${source}`)
                    }
                    title="ダブルクリックで編集"
                  >
                    {editingCell?.source === source &&
                    editingCell.cellKey === `other-source-${source}`
                      ? renderCellEditor(source, `other-source-${source}`)
                      : source}
                  </td>
                  <td
                    className="conversion-table-is-editable"
                    onDoubleClick={() =>
                      startInlineEdit(source, target, `other-target-${source}`)
                    }
                    title="ダブルクリックで編集"
                  >
                    {editingCell?.source === source &&
                    editingCell.cellKey === `other-target-${source}`
                      ? renderCellEditor(source, `other-target-${source}`)
                      : renderEditableTarget(target)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollableTableWrap>
      )}
    </div>
  );
}

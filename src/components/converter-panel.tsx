import { useEffect, useMemo, useState } from 'react';

import '@/components/converter-panel.css';
import { decodeTextWithMappings } from '@/lib/conversion';
import { openSearchPage, shouldUsePostSearch } from '@/lib/search';
import type { ConverterTab, DecodeMap } from '@/lib/types';

const OFFICIAL_SEARCH_ROOT_URL = 'https://www.qtes9gu0k.xyz/';

interface ConverterSegment {
  token: string;
  candidates: string[];
}

function tokenizeByLongestTargets(text: string, targets: string[]): string[] {
  const tokens: string[] = [];
  let index = 0;

  while (index < text.length) {
    const matched = targets.find((target) => text.startsWith(target, index));
    if (matched) {
      tokens.push(matched);
      index += matched.length;
      continue;
    }

    const char = text[index];
    if (char) {
      tokens.push(char);
    }
    index += 1;
  }

  return tokens;
}

export function ConverterPanel({
  mappings,
  enableOkck24HourMode,
  tab,
  onTabChange
}: {
  mappings: DecodeMap;
  enableOkck24HourMode: boolean;
  tab?: ConverterTab;
  onTabChange?: (nextTab: ConverterTab) => void;
}) {
  const [glyphToTextInput, setGlyphToTextInput] = useState('');
  const [textToGlyphInput, setTextToGlyphInput] = useState('');
  const [textToGlyphSelected, setTextToGlyphSelected] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [internalTab, setInternalTab] = useState<ConverterTab>('textToGlyph');

  const activeTab = tab ?? internalTab;

  const glyphToTextOutput = useMemo(
    () => decodeTextWithMappings(glyphToTextInput, mappings),
    [glyphToTextInput, mappings]
  );

  const textToGlyphSegments = useMemo<ConverterSegment[]>(() => {
    const reverseMap = new Map<string, string[]>();
    Object.entries(mappings).forEach(([source, target]) => {
      if (!target) {
        return;
      }
      const existing = reverseMap.get(target);
      if (existing) {
        existing.push(source);
        return;
      }
      reverseMap.set(target, [source]);
    });

    for (const candidates of reverseMap.values()) {
      candidates.sort((a, b) => a.localeCompare(b));
    }

    const targets = Array.from(reverseMap.keys()).sort(
      (a, b) => b.length - a.length
    );

    return tokenizeByLongestTargets(textToGlyphInput, targets).map((token) => ({
      token,
      candidates: reverseMap.get(token) ?? []
    }));
  }, [mappings, textToGlyphInput]);

  useEffect(() => {
    setTextToGlyphSelected((prev) =>
      textToGlyphSegments.map((segment, index) => {
        const previous = prev[index];
        if (previous && segment.candidates.includes(previous)) {
          return previous;
        }
        return segment.candidates[0] ?? '';
      })
    );
  }, [textToGlyphSegments]);

  const textToGlyphOutput = useMemo(
    () =>
      textToGlyphSegments
        .map((segment, index) => textToGlyphSelected[index] || segment.token)
        .join(''),
    [textToGlyphSegments, textToGlyphSelected]
  );

  function clearStatus(): void {
    setMessage('');
    setError('');
  }

  function handleSelectTab(nextTab: ConverterTab): void {
    if (tab === undefined) {
      setInternalTab(nextTab);
    }
    onTabChange?.(nextTab);
  }

  async function handleCopyResult(
    value: string,
    successMessage: string
  ): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setError('');
      setMessage(successMessage);
    } catch {
      setMessage('');
      setError('コピーに失敗しました。');
    }
  }

  function handleSearchOfficialSite(query: string): void {
    openSearchPage({
      rootUrl: OFFICIAL_SEARCH_ROOT_URL,
      query,
      openInNewTab: true,
      usePost: shouldUsePostSearch(
        OFFICIAL_SEARCH_ROOT_URL,
        enableOkck24HourMode
      )
    });
  }

  return (
    <>
      {message ? (
        <p className="converter-status is-success">{message}</p>
      ) : null}
      {error ? <p className="converter-status is-error">{error}</p> : null}

      <div className="converter-tab-group">
        <button
          type="button"
          className={
            activeTab === 'textToGlyph'
              ? 'converter-button is-active'
              : 'converter-button'
          }
          onClick={() => {
            handleSelectTab('textToGlyph');
          }}
        >
          日本語 → 桶地下
        </button>
        <button
          type="button"
          className={
            activeTab === 'glyphToText'
              ? 'converter-button is-active'
              : 'converter-button'
          }
          onClick={() => {
            handleSelectTab('glyphToText');
          }}
        >
          桶地下 → 日本語
        </button>
      </div>

      <div className="converter-section">
        {activeTab === 'glyphToText' ? (
          <>
            <textarea
              className="converter-textarea"
              rows={1}
              value={glyphToTextInput}
              onChange={(event) => {
                setGlyphToTextInput(event.currentTarget.value);
                clearStatus();
              }}
              placeholder="桶地下文字を入力"
            />
            <div className="converter-output">
              {glyphToTextOutput || '（変換結果）'}
            </div>
            <button
              type="button"
              className="converter-button"
              onClick={() => {
                void handleCopyResult(
                  glyphToTextOutput,
                  '日本語変換結果をコピーしました。'
                );
              }}
              disabled={!glyphToTextOutput}
            >
              結果をコピー
            </button>
          </>
        ) : null}

        {activeTab === 'textToGlyph' ? (
          <>
            <textarea
              className="converter-textarea"
              rows={1}
              value={textToGlyphInput}
              onChange={(event) => {
                setTextToGlyphInput(event.currentTarget.value);
                clearStatus();
              }}
              placeholder="日本語を入力"
            />
            <div className="converter-candidates">
              {textToGlyphSegments.length === 0 ? (
                <p className="converter-empty">候補がここに表示されます。</p>
              ) : (
                textToGlyphSegments.map((segment, index) => (
                  <div
                    key={`segment-${index}-${segment.token}`}
                    className="converter-segment"
                  >
                    <span className="converter-token">{segment.token}</span>
                    {segment.candidates.length === 0 ? (
                      <span className="converter-no-candidate">候補なし</span>
                    ) : (
                      <div className="converter-choices">
                        {segment.candidates.map((candidate) => (
                          <button
                            key={`choice-${index}-${candidate}`}
                            type="button"
                            className={
                              textToGlyphSelected[index] === candidate
                                ? 'converter-button is-active'
                                : 'converter-button'
                            }
                            onClick={() => {
                              setTextToGlyphSelected((prev) => {
                                const next = [...prev];
                                next[index] = candidate;
                                return next;
                              });
                              clearStatus();
                            }}
                          >
                            {candidate}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
            <div className="converter-output">
              {textToGlyphOutput || '（変換結果）'}
            </div>
            <div className="converter-actions">
              <button
                type="button"
                className="converter-button"
                onClick={() => {
                  void handleCopyResult(
                    textToGlyphOutput,
                    '桶地下文字変換結果をコピーしました。'
                  );
                }}
                disabled={!textToGlyphOutput}
              >
                結果をコピー
              </button>
              <button
                type="button"
                className="converter-button"
                onClick={() => {
                  handleSearchOfficialSite(textToGlyphOutput);
                }}
                disabled={!textToGlyphOutput}
              >
                公式サイトで検索
              </button>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

type TerminalBootstrap = {
  cwd: string;
  shell: string;
};

type TerminalSession = {
  session_id: string;
  cwd: string;
  shell: string;
};

type TerminalEvent = {
  session_id: string;
  chunk: string;
  cwd?: string | null;
  exit_code?: number | null;
};

type TerminalTab = {
  id: string;
  title: string;
  cwd: string;
  shell: string;
  sessionId: string;
};

type TerminalPane = {
  terminal: Terminal;
  fitAddon: FitAddon;
  dataDisposer?: { dispose: () => void };
  compositionCleanup?: () => void;
};

type GuardedTerminalTextArea = HTMLTextAreaElement & {
  __sodaImeGuard?: boolean;
  __sodaCompositionValue?: string;
  __sodaSuppressNextInput?: boolean;
};

function folderLabel(path: string, fallback: string) {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : fallback;
}

export default function TerminalWorkspace() {
  const [bootstrap, setBootstrap] = useState<TerminalBootstrap | null>(null);
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();
  const defaultTabTitle = "Terminal";
  const terminalHostRef = useRef<HTMLDivElement>(null);
  const tabsScrollerRef = useRef<HTMLDivElement>(null);
  const panesRef = useRef<Record<string, TerminalPane>>({});
  const sessionToTabRef = useRef<Record<string, string>>({});
  const tabsRef = useRef<TerminalTab[]>([]);
  const closeTabRef = useRef<(tabId: string) => Promise<void>>(() => Promise.resolve());
  const isComposingRef = useRef(false);
  const initialTabCreatedRef = useRef(false);
  const creatingInitialTabRef = useRef(false);
  const bootstrappedRef = useRef(false);

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [tabs, activeTabId]
  );

  useEffect(() => {
    tabsRef.current = tabs;
    if (tabs.length > 0) {
      initialTabCreatedRef.current = true;
    }
  }, [tabs]);

  const createTerminalPane = useCallback((tabId: string) => {
    const pane = panesRef.current[tabId];
    if (pane) {
      return pane;
    }

    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: "block",
      fontFamily: '"SFMono-Regular", Menlo, Monaco, Consolas, monospace',
      fontSize: 14,
      theme: {
        background: "#050816",
        foreground: "#d1fae5",
        cursor: "#86efac",
        cursorAccent: "transparent",
        selectionBackground: "rgba(134, 239, 172, 0.24)",
        black: "#0f172a",
        red: "#f87171",
        green: "#4ade80",
        yellow: "#facc15",
        blue: "#60a5fa",
        magenta: "#f472b6",
        cyan: "#22d3ee",
        white: "#e2e8f0",
        brightBlack: "#334155",
        brightRed: "#fca5a5",
        brightGreen: "#86efac",
        brightYellow: "#fde68a",
        brightBlue: "#93c5fd",
        brightMagenta: "#f9a8d4",
        brightCyan: "#67e8f9",
        brightWhite: "#f8fafc",
      },
      allowTransparency: true,
      customGlyphs: true,
      scrollback: 4000,
      convertEol: false,
      macOptionIsMeta: true,
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    const nextPane: TerminalPane = { terminal, fitAddon };
    panesRef.current[tabId] = nextPane;
    return nextPane;
  }, [t]);

  const mountActiveTerminal = useCallback(() => {
    const host = terminalHostRef.current;
    if (!host || !activeTab) {
      return;
    }

    const pane = createTerminalPane(activeTab.id);
    const element = pane.terminal.element;
    if (!element || element.parentElement !== host) {
      host.innerHTML = "";
      if (element) {
        host.appendChild(element);
      } else {
        pane.terminal.open(host);

        const textarea = pane.terminal.textarea as GuardedTerminalTextArea | undefined;
        if (textarea && !textarea.__sodaImeGuard) {
          const sessionId = activeTab.sessionId;
          textarea.__sodaImeGuard = true;
          textarea.__sodaCompositionValue = "";
          textarea.__sodaSuppressNextInput = false;

          const resetTextarea = () => {
            textarea.value = "";
            textarea.__sodaCompositionValue = "";
            textarea.__sodaSuppressNextInput = false;
            textarea.setSelectionRange(0, 0);
          };

          const handleCompositionStart = () => {
            isComposingRef.current = true;
            textarea.__sodaCompositionValue = "";
            textarea.__sodaSuppressNextInput = false;
          };

          const handleCompositionUpdate = (event: CompositionEvent) => {
            textarea.__sodaCompositionValue = event.data ?? "";
          };

          const handleCompositionEnd = () => {
            isComposingRef.current = false;
            const committed = textarea.__sodaCompositionValue ?? "";
            if (!committed) {
              window.setTimeout(resetTextarea, 0);
              return;
            }

            textarea.__sodaSuppressNextInput = true;
            void invoke("terminal_write", {
              req: {
                sessionId,
                data: committed,
              },
            }).catch((err) => {
              setError(String(err));
            });

            window.setTimeout(resetTextarea, 0);
          };

          const handleInput = (event: Event) => {
            if (!textarea.__sodaSuppressNextInput) {
              return;
            }

            const inputEvent = event as InputEvent;
            const inputData = inputEvent.data ?? "";
            const committed = textarea.__sodaCompositionValue ?? "";
            if (inputData === committed || (inputData === " " && committed.length > 0)) {
              event.stopImmediatePropagation();
              event.preventDefault();
              if (inputData === " ") {
                void invoke("terminal_write", {
                  req: {
                    sessionId,
                    data: " ",
                  },
                }).catch((err) => {
                  setError(String(err));
                });
              }
              textarea.__sodaSuppressNextInput = false;
            }
          };

          const handleBlur = () => {
            isComposingRef.current = false;
            resetTextarea();
          };

          textarea.addEventListener("compositionstart", handleCompositionStart, true);
          textarea.addEventListener("compositionupdate", handleCompositionUpdate, true);
          textarea.addEventListener("compositionend", handleCompositionEnd, true);
          textarea.addEventListener("input", handleInput, true);
          textarea.addEventListener("blur", handleBlur, true);

          pane.compositionCleanup = () => {
            textarea.removeEventListener("compositionstart", handleCompositionStart, true);
            textarea.removeEventListener("compositionupdate", handleCompositionUpdate, true);
            textarea.removeEventListener("compositionend", handleCompositionEnd, true);
            textarea.removeEventListener("input", handleInput, true);
            textarea.removeEventListener("blur", handleBlur, true);
            delete textarea.__sodaImeGuard;
            delete textarea.__sodaCompositionValue;
            delete textarea.__sodaSuppressNextInput;
          };
        }
      }
    }
    pane.fitAddon.fit();
    if (!isComposingRef.current) {
      pane.terminal.focus();
    }

    if (!pane.dataDisposer) {
      pane.dataDisposer = pane.terminal.onData((data) => {
        void invoke("terminal_write", {
          req: {
            sessionId: activeTab.sessionId,
            data,
          },
        }).catch((err) => {
          setError(String(err));
        });
      });
    }
  }, [activeTab, createTerminalPane]);

  const createTab = useCallback(async () => {
    if (!bootstrap) {
      return;
    }

    try {
      setError(null);
      const session = await invoke<TerminalSession>("terminal_create_session", {
        req: bootstrap,
      });
      const tabId = crypto.randomUUID();
      sessionToTabRef.current[session.session_id] = tabId;
      createTerminalPane(tabId);
      setTabs((current) => [
        ...current,
        {
          id: tabId,
          title: `${defaultTabTitle} ${current.length + 1}`,
          cwd: session.cwd,
          shell: session.shell,
          sessionId: session.session_id,
        },
      ]);
      setActiveTabId(tabId);
    } catch (err) {
      setError(String(err));
    }
  }, [bootstrap, createTerminalPane]);

  const closeTab = useCallback(
    async (tabId: string) => {
      const tab = tabs.find((entry) => entry.id === tabId);
      if (!tab) {
        return;
      }

      delete sessionToTabRef.current[tab.sessionId];
      const pane = panesRef.current[tabId];
      pane?.dataDisposer?.dispose();
      pane?.compositionCleanup?.();
      pane?.terminal.dispose();
      delete panesRef.current[tabId];

      setTabs((current) => {
        const remaining = current.filter((entry) => entry.id !== tabId);
        if (remaining.length === 0) {
          initialTabCreatedRef.current = false;
        }
        return remaining;
      });
      if (activeTabId === tabId) {
        const remaining = tabs.filter((entry) => entry.id !== tabId);
        setActiveTabId(remaining[remaining.length - 1]?.id ?? null);
      }

      try {
        await invoke("terminal_close_session", { sessionId: tab.sessionId });
      } catch (err) {
        setError(String(err));
      }
    },
    [activeTabId, tabs]
  );

  useEffect(() => {
    closeTabRef.current = closeTab;
  }, [closeTab]);

  useEffect(() => {
    if (bootstrappedRef.current) {
      return;
    }
    bootstrappedRef.current = true;

    invoke<TerminalBootstrap>("get_terminal_bootstrap")
      .then((init) => {
        setBootstrap(init);
      })
      .catch((err) => {
        setError(String(err));
      });
  }, []);

  useEffect(() => {
    if (!bootstrap || tabs.length > 0 || creatingInitialTabRef.current || initialTabCreatedRef.current) {
      return;
    }

    initialTabCreatedRef.current = true;
    creatingInitialTabRef.current = true;
    void createTab().finally(() => {
      creatingInitialTabRef.current = false;
    });
  }, [bootstrap, createTab, tabs.length]);

  useEffect(() => {
    let unlistenOutput: UnlistenFn | undefined;
    let unlistenExit: UnlistenFn | undefined;

    const attach = async () => {
      unlistenOutput = await listen<TerminalEvent>("terminal://output", (event) => {
        const payload = event.payload;
        const tabId = sessionToTabRef.current[payload.session_id];
        if (!tabId) {
          return;
        }
        const pane = panesRef.current[tabId];
        pane?.terminal.write(payload.chunk);
        if (payload.cwd) {
          setTabs((current) =>
            current.map((tab) =>
              tab.id === tabId
                ? {
                    ...tab,
                    cwd: payload.cwd ?? tab.cwd,
                    title: tab.title.startsWith(defaultTabTitle) ? folderLabel(payload.cwd ?? tab.cwd, defaultTabTitle) : tab.title,
                  }
                : tab
            )
          );
        }
      });

      unlistenExit = await listen<TerminalEvent>("terminal://exit", (event) => {
        const payload = event.payload;
        const tabId = sessionToTabRef.current[payload.session_id];
        if (!tabId) {
          return;
        }
        const pane = panesRef.current[tabId];
        const suffix = payload.exit_code != null ? t("terminal.exitCodeSuffix", { code: payload.exit_code }) : "";
        pane?.terminal.writeln(`\r\n${t("terminal.processExited", { suffix })}`);
        void closeTabRef.current(tabId);
      });
    };

    void attach();

    return () => {
      unlistenOutput?.();
      unlistenExit?.();
    };
  }, []);

  useEffect(() => {
    return () => {
      const tabSnapshot = [...tabsRef.current];
      for (const tab of tabSnapshot) {
        void invoke("terminal_close_session", { sessionId: tab.sessionId }).catch(() => undefined);
      }
      for (const pane of Object.values(panesRef.current)) {
        pane.dataDisposer?.dispose();
        pane.compositionCleanup?.();
        pane.terminal.dispose();
      }
      panesRef.current = {};
      sessionToTabRef.current = {};
    };
  }, []);

  useEffect(() => {
    const scroller = tabsScrollerRef.current;
    if (!scroller) {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      const horizontalDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (horizontalDelta === 0) {
        return;
      }

      scroller.scrollBy({
        left: horizontalDelta,
        behavior: "auto",
      });
      event.preventDefault();
    };

    scroller.addEventListener("wheel", handleWheel, { passive: false });
    return () => scroller.removeEventListener("wheel", handleWheel);
  }, []);

  useEffect(() => {
    if (!activeTab) {
      return;
    }
    mountActiveTerminal();

    const doResize = () => {
      const pane = panesRef.current[activeTab.id];
      if (!pane) {
        return;
      }
      pane.fitAddon.fit();
      const dims = pane.fitAddon.proposeDimensions();
      if (dims) {
        void invoke("terminal_resize", {
          req: {
            sessionId: activeTab.sessionId,
            cols: dims.cols,
            rows: dims.rows,
          },
        }).catch(() => undefined);
      }
    };

    const timer = setTimeout(() => doResize(), 100);

    const host = terminalHostRef.current;
    const observer = host
      ? new ResizeObserver(() => doResize())
      : null;
    observer?.observe(host!);

    window.addEventListener("resize", doResize);
    return () => {
      clearTimeout(timer);
      observer?.disconnect();
      window.removeEventListener("resize", doResize);
    };
  }, [activeTab, mountActiveTerminal]);

  return (
    <section
      className="flex h-full flex-col"
      style={{
        background: `radial-gradient(circle at top left, rgba(121, 168, 18, 0.08), transparent 32%), linear-gradient(180deg, rgba(17, 24, 39, 0.02), transparent 22%), var(--color-background)`,
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col p-4">
        <div className="flex items-center gap-2 pb-2.5">
          <div ref={tabsScrollerRef} className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {tabs.map((tab) => {
              const isActive = tab.id === activeTabId;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTabId(tab.id)}
                  className={`inline-flex items-center gap-2 rounded-[10px] border text-[0.82rem] transition-[background,color,border-color] duration-150 min-w-[8.5rem] max-w-[11rem] px-3 py-2 cursor-pointer ${
                    isActive
                      ? "border-christi/78 text-[#f8fff0] shadow-[0_10px_24px_rgba(121,168,18,0.24)]"
                      : "border-transparent text-text-secondary/86 bg-surface/90 hover:bg-surface-hover"
                  }`}
                  style={
                    isActive
                      ? {
                          background: `linear-gradient(135deg, var(--color-christi), color-mix(in srgb, var(--color-christi) 72%, var(--color-gold)))`,
                          borderColor: `color-mix(in srgb, var(--color-christi) 78%, white)`,
                        }
                      : undefined
                  }
                >
                  <span className="min-w-0 flex-1 truncate text-left">{tab.title}</span>
                  <span
                    title={t("terminal.closeTab")}
                    className="ml-auto inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full opacity-68 text-[0.72rem] hover:bg-white/8 hover:opacity-100"
                    onClick={(event) => {
                      event.stopPropagation();
                      void closeTab(tab.id);
                    }}
                  >
                    x
                  </span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            title={t("terminal.newTab")}
            onClick={() => void createTab()}
            disabled={!bootstrap}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/84 bg-gradient-to-br from-christi/16 to-leaf/10 p-0 text-base font-semibold text-text-primary transition-[transform,border-color,background] duration-150 hover:not-disabled:-translate-y-px hover:not-disabled:border-christi/70 disabled:cursor-not-allowed disabled:opacity-55"
          >
            +
          </button>
        </div>

        <div
          className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[18px] border border-term-screen-border"
          style={{
            background: `radial-gradient(circle at top, var(--color-term-green), transparent 28%), linear-gradient(180deg, var(--color-term-screen-start), var(--color-term-bg) 85%)`,
            boxShadow: `0 18px 50px var(--color-term-shadow), inset 0 1px 0 rgba(255, 255, 255, 0.03)`,
          }}
        >
          <div className="border-b border-white/5 px-4 py-2 text-xs text-emerald-200/70">
            {activeTab ? activeTab.shell : t("terminal.loadingShell")}
          </div>
          {error && (
            <div className="mx-4 mt-4 mb-0 rounded-xl bg-red-500/16 px-3.5 py-3 text-[#fecaca] border border-red-400/28">{error}</div>
          )}
          <div ref={terminalHostRef} className="terminal-canvas relative flex-1 min-h-0 overflow-hidden" />
        </div>
      </div>
    </section>
  );
}

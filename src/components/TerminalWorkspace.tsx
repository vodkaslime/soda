import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ComponentType,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import * as Dialog from "@radix-ui/react-dialog";
import { DndProvider, useDrag, useDrop, useDragLayer } from "react-dnd";
import { HTML5Backend, getEmptyImage } from "react-dnd-html5-backend";
import { Folder, FolderOpen, FileText, Plus, Trash2, X, GripVertical } from "lucide-react";
import type { SyntaxHighlighterProps } from "react-syntax-highlighter";
import SyntaxHighlighter from "react-syntax-highlighter/dist/esm/light-async";
import { nnfxDark, stackoverflowLight } from "react-syntax-highlighter/dist/esm/styles/hljs";
import "@xterm/xterm/css/xterm.css";
import type { AgentStatus } from "../types/agent";
import { useTheme } from "./ThemeProvider";

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

type FileTreeEntry = {
  name: string;
  path: string;
  is_dir: boolean;
};

type FilePreview = {
  path: string;
  content: string;
  truncated: boolean;
};

type TreeNode = {
  entry: FileTreeEntry;
  depth: number;
};

type TreeRowProps = {
  entry: FileTreeEntry;
  isSelected: boolean;
  isExpanded: boolean;
  isLoading: boolean;
  style: CSSProperties;
  onOpen: (entry: FileTreeEntry) => void;
  onOpenInTerminal: (entry: FileTreeEntry) => void;
};

type WorkspaceSideTab = "preview" | "board";

type BoardColumnId = "inbox" | "doing" | "done";

type BoardPriority = "low" | "medium" | "high";

type BoardColor = "leaf" | "gold" | "coral" | "sky";

type BoardCard = {
  id: string;
  title: string;
  note: string;
  column: BoardColumnId;
  priority: BoardPriority;
  color: BoardColor;
  tags: string[];
};

type BoardDragState = {
  cardId: string;
  sourceColumn: BoardColumnId;
};

type BoardDragItem = {
  type: "board-card";
  cardId: string;
  column: BoardColumnId;
  index: number;
  hoverIndex: number;
  title: string;
  note: string;
  priority: BoardPriority;
  color: BoardColor;
  tags: string[];
};

type TerminalBoardCard = {
  id: string;
  title: string;
  note: string;
  column: string;
  priority?: string;
  color?: string;
  tags?: string[];
};

function folderLabel(path: string, fallback: string) {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : fallback;
}

function extractCwdFromChunk(chunk: string) {
  const marker = /\x1f__SODA_CWD__:(.*?)\x1f\r?\n?/g;
  let nextChunk = chunk;
  let nextCwd: string | null = null;
  let match: RegExpExecArray | null;

  while ((match = marker.exec(chunk)) !== null) {
    nextCwd = match[1];
  }

  nextChunk = nextChunk.replace(marker, "");
  return { chunk: nextChunk, cwd: nextCwd };
}

const TREE_ROW_HEIGHT = 36;
const TREE_OVERSCAN = 8;

const BOARD_COLUMNS: Array<{ id: BoardColumnId; label: string }> = [
  { id: "inbox", label: "Inbox" },
  { id: "doing", label: "Doing" },
  { id: "done", label: "Done" },
];

const BOARD_PRIORITY_OPTIONS: BoardPriority[] = ["low", "medium", "high"];
const BOARD_COLOR_OPTIONS: BoardColor[] = ["leaf", "gold", "coral", "sky"];

const BOARD_PRIORITY_LABELS: Record<BoardPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

const BOARD_COLOR_LABELS: Record<BoardColor, string> = {
  leaf: "Leaf",
  gold: "Gold",
  coral: "Coral",
  sky: "Sky",
};

const BOARD_COLOR_STYLES: Record<BoardColor, string> = {
  leaf: "bg-leaf/6",
  gold: "bg-gold/6",
  coral: "bg-coral/6",
  sky: "bg-sky-500/6",
};

const INITIAL_BOARD_CARDS: BoardCard[] = [
  {
    id: "board-1",
    title: "Capture the next feature idea",
    note: "Keep rough ideas here before they turn into terminal work.",
    column: "inbox",
    priority: "medium",
    color: "gold",
    tags: ["idea"],
  },
  {
    id: "board-2",
    title: "Ship the current terminal iteration",
    note: "Use this lane for the thing you are actively pushing forward.",
    column: "doing",
    priority: "high",
    color: "coral",
    tags: ["focus"],
  },
  {
    id: "board-3",
    title: "Close out finished work",
    note: "Move completed tasks here so progress stays visible.",
    column: "done",
    priority: "low",
    color: "leaf",
    tags: ["shipped"],
  },
];

type SyntaxHighlighterComponent = ComponentType<SyntaxHighlighterProps> & {
  registerLanguage: (name: string, func: unknown) => void;
};

type CodeLanguageConfig = {
  language: string;
  label: string;
  loader: () => Promise<{ default: unknown }>;
};

const AsyncSyntaxHighlighter =
  SyntaxHighlighter as SyntaxHighlighterComponent;

const CODE_PREVIEW_LANGUAGES: Record<string, CodeLanguageConfig> = {
  js: {
    language: "javascript",
    label: "JavaScript",
    loader: () => import("react-syntax-highlighter/dist/esm/languages/hljs/javascript"),
  },
  jsx: {
    language: "javascript",
    label: "JavaScript",
    loader: () => import("react-syntax-highlighter/dist/esm/languages/hljs/javascript"),
  },
  mjs: {
    language: "javascript",
    label: "JavaScript",
    loader: () => import("react-syntax-highlighter/dist/esm/languages/hljs/javascript"),
  },
  cjs: {
    language: "javascript",
    label: "JavaScript",
    loader: () => import("react-syntax-highlighter/dist/esm/languages/hljs/javascript"),
  },
  ts: {
    language: "typescript",
    label: "TypeScript",
    loader: () => import("react-syntax-highlighter/dist/esm/languages/hljs/typescript"),
  },
  tsx: {
    language: "typescript",
    label: "TypeScript",
    loader: () => import("react-syntax-highlighter/dist/esm/languages/hljs/typescript"),
  },
  json: {
    language: "json",
    label: "JSON",
    loader: () => import("react-syntax-highlighter/dist/esm/languages/hljs/json"),
  },
  py: {
    language: "python",
    label: "Python",
    loader: () => import("react-syntax-highlighter/dist/esm/languages/hljs/python"),
  },
  rs: {
    language: "rust",
    label: "Rust",
    loader: () => import("react-syntax-highlighter/dist/esm/languages/hljs/rust"),
  },
  css: {
    language: "css",
    label: "CSS",
    loader: () => import("react-syntax-highlighter/dist/esm/languages/hljs/css"),
  },
  scss: {
    language: "css",
    label: "SCSS",
    loader: () => import("react-syntax-highlighter/dist/esm/languages/hljs/css"),
  },
  less: {
    language: "css",
    label: "LESS",
    loader: () => import("react-syntax-highlighter/dist/esm/languages/hljs/css"),
  },
  html: {
    language: "xml",
    label: "HTML",
    loader: () => import("react-syntax-highlighter/dist/esm/languages/hljs/xml"),
  },
  htm: {
    language: "xml",
    label: "HTML",
    loader: () => import("react-syntax-highlighter/dist/esm/languages/hljs/xml"),
  },
  xml: {
    language: "xml",
    label: "XML",
    loader: () => import("react-syntax-highlighter/dist/esm/languages/hljs/xml"),
  },
  svg: {
    language: "xml",
    label: "SVG",
    loader: () => import("react-syntax-highlighter/dist/esm/languages/hljs/xml"),
  },
  md: {
    language: "markdown",
    label: "Markdown",
    loader: () => import("react-syntax-highlighter/dist/esm/languages/hljs/markdown"),
  },
  markdown: {
    language: "markdown",
    label: "Markdown",
    loader: () => import("react-syntax-highlighter/dist/esm/languages/hljs/markdown"),
  },
  yml: {
    language: "yaml",
    label: "YAML",
    loader: () => import("react-syntax-highlighter/dist/esm/languages/hljs/yaml"),
  },
  yaml: {
    language: "yaml",
    label: "YAML",
    loader: () => import("react-syntax-highlighter/dist/esm/languages/hljs/yaml"),
  },
  sh: {
    language: "bash",
    label: "Shell",
    loader: () => import("react-syntax-highlighter/dist/esm/languages/hljs/bash"),
  },
  bash: {
    language: "bash",
    label: "Bash",
    loader: () => import("react-syntax-highlighter/dist/esm/languages/hljs/bash"),
  },
  zsh: {
    language: "shell",
    label: "Zsh",
    loader: () => import("react-syntax-highlighter/dist/esm/languages/hljs/shell"),
  },
  fish: {
    language: "shell",
    label: "Fish",
    loader: () => import("react-syntax-highlighter/dist/esm/languages/hljs/shell"),
  },
  sql: {
    language: "sql",
    label: "SQL",
    loader: () => import("react-syntax-highlighter/dist/esm/languages/hljs/sql"),
  },
  diff: {
    language: "diff",
    label: "Diff",
    loader: () => import("react-syntax-highlighter/dist/esm/languages/hljs/diff"),
  },
  patch: {
    language: "diff",
    label: "Patch",
    loader: () => import("react-syntax-highlighter/dist/esm/languages/hljs/diff"),
  },
};

const loadedPreviewLanguages = new Set<string>();

function getCodePreviewConfig(path: string) {
  const ext = path.split(".").pop()?.toLowerCase();
  if (!ext) {
    return null;
  }

  return CODE_PREVIEW_LANGUAGES[ext] ?? null;
}

function buildCodePreviewTheme(isDark: boolean): CSSProperties {
  return {
    ...((isDark ? nnfxDark : stackoverflowLight).hljs ?? {}),
    margin: 0,
    background: "transparent",
    padding: 0,
    minHeight: "100%",
    fontSize: "0.75rem",
    lineHeight: 1.65,
    fontFamily:
      '"IBM Plex Mono", "SFMono-Regular", Menlo, Monaco, Consolas, monospace',
  };
}

const TreeRow = memo(function TreeRow({
  entry,
  isSelected,
  isExpanded,
  isLoading,
  style,
  onOpen,
  onOpenInTerminal,
}: TreeRowProps) {
  return (
    <button
      type="button"
      onClick={() => onOpen(entry)}
      className={`group flex w-full items-center gap-2 px-3.5 py-2 text-left text-sm transition cursor-pointer ${
        isSelected
          ? "bg-christi/10 text-text-primary"
          : "text-text-primary hover:bg-surface-hover"
      }`}
      title={entry.path}
      style={style}
    >
      <span
        className="inline-flex h-5 w-5 items-center justify-center text-text-secondary"
        title={
          entry.is_dir
            ? isExpanded
              ? "Folder expanded"
              : "Folder collapsed"
            : "File"
        }
      >
        {entry.is_dir ? (
          isLoading ? (
            <Folder className="h-4 w-4 opacity-60" />
          ) : isExpanded ? (
            <FolderOpen className="h-4 w-4 text-gold" />
          ) : (
            <Folder className="h-4 w-4 text-gold" />
          )
        ) : (
          <FileText className="h-4 w-4 text-text-muted" />
        )}
      </span>
      <span className="whitespace-nowrap">{entry.name}</span>
      {entry.is_dir ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void onOpenInTerminal(entry);
          }}
          className="ml-auto rounded-md border border-border px-2 py-0.5 text-[0.65rem] text-text-secondary opacity-0 transition hover:border-christi/35 hover:text-text-primary group-hover:opacity-100 focus:opacity-100 cursor-pointer"
          title="Open this folder in the terminal"
        >
          cd
        </button>
      ) : null}
    </button>
  );
});

type BoardCardViewProps = {
  card: BoardCard;
  isDragging?: boolean;
  style?: CSSProperties;
  dragHandleProps?: {
    ref: (node: HTMLDivElement | null) => void;
    onMouseDown?: (event: ReactMouseEvent<HTMLDivElement>) => void;
  };
  onEdit: (card: BoardCard) => void;
  onDelete: (cardId: string) => void;
};

function BoardCardView({
  card,
  isDragging = false,
  style,
  dragHandleProps,
  onEdit,
  onDelete,
}: BoardCardViewProps) {
  const isInteractive = Boolean(onEdit) || Boolean(onDelete);
  return (
    <div
      style={style}
      className={`rounded-2xl border border-border p-3 shadow-sm transition-[transform,opacity,box-shadow,border-color,background] ${BOARD_COLOR_STYLES[card.color]} ${
        isDragging ? "opacity-35 shadow-none" : "hover:shadow-md"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-text-muted/70 transition hover:bg-background hover:text-text-primary cursor-grab active:cursor-grabbing select-none"
          aria-label="Drag task"
          ref={dragHandleProps?.ref}
          onMouseDown={dragHandleProps?.onMouseDown}
        >
          <GripVertical className="h-4 w-4" />
        </div>
        <button
          type="button"
          onClick={() => onEdit(card)}
          disabled={!isInteractive}
          className={`min-w-0 flex-1 text-left ${isInteractive ? "cursor-pointer" : "cursor-default"}`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold text-text-primary">
              {card.title}
            </div>
            <span className="rounded-full border border-border px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-text-secondary">
              {BOARD_PRIORITY_LABELS[card.priority]}
            </span>
          </div>
          {card.note ? (
            <div className="mt-2 text-xs leading-5 text-text-secondary whitespace-pre-wrap break-words">
              {card.note}
            </div>
          ) : null}
          {card.tags.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {card.tags.map((tag) => (
                <span
                  key={`${card.id}-${tag}`}
                  className="rounded-full border border-border/80 bg-background/80 px-2 py-0.5 text-[0.62rem] font-medium text-text-secondary"
                >
                  #{tag}
                </span>
              ))}
            </div>
          ) : null}
        </button>
        {isInteractive ? (
          <button
            type="button"
            onClick={() => onDelete(card.id)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-text-muted transition hover:bg-background hover:text-coral cursor-pointer"
            title="Delete task"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

type BoardColumnProps = {
  columnId: BoardColumnId;
  label: string;
  cards: BoardCard[];
  isActiveDrop: boolean;
  onEdit: (card: BoardCard) => void;
  onDelete: (cardId: string) => void;
};

function findBoardCard(cards: BoardCard[], cardId: string) {
  return cards.find((card) => card.id === cardId) ?? null;
}

function reorderBoardCards(
  cards: BoardCard[],
  cardId: string,
  targetColumn: BoardColumnId,
  targetIndex: number,
) {
  const movingCard = findBoardCard(cards, cardId);
  if (!movingCard) {
    return cards;
  }

  const withoutMovingCard = cards.filter((card) => card.id !== cardId);
  const grouped = BOARD_COLUMNS.reduce<Record<BoardColumnId, BoardCard[]>>(
    (acc, column) => {
      acc[column.id] = withoutMovingCard.filter((card) => card.column === column.id);
      return acc;
    },
    { inbox: [], doing: [], done: [] },
  );

  const nextColumnCards = [...grouped[targetColumn]];
  const safeIndex = Math.max(0, Math.min(targetIndex, nextColumnCards.length));
  nextColumnCards.splice(safeIndex, 0, { ...movingCard, column: targetColumn });
  grouped[targetColumn] = nextColumnCards;

  return BOARD_COLUMNS.flatMap((column) => grouped[column.id]);
}

function BoardDragPreview() {
  const { itemType, isDragging, item, currentOffset } = useDragLayer((monitor) => ({
    itemType: monitor.getItemType(),
    isDragging: monitor.isDragging(),
    item: monitor.getItem() as BoardDragItem | null,
    currentOffset: monitor.getSourceClientOffset(),
  }));

  if (!isDragging || itemType !== "board-card" || !item || !currentOffset) {
    return null;
  }

  const previewCard: BoardCard = {
    id: item.cardId,
    title: item.title,
    note: item.note,
    column: item.column,
    priority: item.priority,
    color: item.color,
    tags: item.tags,
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-[70]">
      <div
        style={{
          transform: `translate(${currentOffset.x + 10}px, ${currentOffset.y + 8}px) rotate(1.5deg)`,
        }}
        className="w-[min(28rem,calc(100vw-4rem))]"
      >
        <div className="rounded-[24px] border border-border/90 bg-surface/96 p-1 shadow-[0_22px_60px_rgba(15,23,42,0.22)] backdrop-blur-md">
          <BoardCardView
            card={previewCard}
            style={{ margin: 0 }}
            onEdit={() => undefined}
            onDelete={() => undefined}
          />
        </div>
      </div>
    </div>
  );
}

function DraggableBoardCard({
  card,
  index,
  onMove,
  onDropCard,
  onDragStart,
  onDragEnd,
  onEdit,
  onDelete,
}: BoardCardViewProps & {
  index: number;
  onMove: (cardId: string, column: BoardColumnId, index: number) => void;
  onDropCard: (cardId: string, column: BoardColumnId, index: number) => void;
  onDragStart: (card: BoardCard) => void;
  onDragEnd: (nextCards?: BoardCard[]) => void;
}) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [{ isDragging }, drag, preview] = useDrag(() => ({
    type: "board-card",
    item: (): BoardDragItem => {
      onDragStart(card);
      return {
        type: "board-card",
        cardId: card.id,
        column: card.column,
        index,
        hoverIndex: index,
        title: card.title,
        note: card.note,
        priority: card.priority,
        color: card.color,
        tags: card.tags,
      };
    },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
    end: (_item, monitor) => {
      if (!monitor.didDrop()) {
        onDragEnd();
      }
    },
  }), [card, index, onDragEnd, onDragStart]);

  useEffect(() => {
    preview(getEmptyImage(), { captureDraggingState: true });
  }, [preview]);

  const [, drop] = useDrop<BoardDragItem>(() => ({
    accept: "board-card",
    hover: (item, monitor) => {
      if (!previewRef.current) {
        return;
      }
      const rect = previewRef.current.getBoundingClientRect();
      const middleY = (rect.bottom - rect.top) / 2;
      const clientOffset = monitor.getClientOffset();
      if (!clientOffset) {
        return;
      }
      const hoverClientY = clientOffset.y - rect.top;
      const insertBefore = hoverClientY < middleY;
      const nextIndex = insertBefore ? index : index + 1;
      if (item.cardId === card.id && item.column === card.column) {
        return;
      }
      if (item.column === card.column && item.hoverIndex === nextIndex) {
        return;
      }
      onMove(item.cardId, card.column, nextIndex);
      item.column = card.column;
      item.hoverIndex = nextIndex;
    },
    drop: (item, monitor) => {
      if (monitor.didDrop()) {
        return;
      }
      const rect = previewRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      const clientOffset = monitor.getClientOffset();
      const hoverClientY = clientOffset ? clientOffset.y - rect.top : 0;
      const middleY = (rect.bottom - rect.top) / 2;
      const nextIndex = item.column === card.column ? item.hoverIndex : hoverClientY < middleY ? index : index + 1;
      onDropCard(item.cardId, card.column, nextIndex);
      item.column = card.column;
      item.index = nextIndex;
      item.hoverIndex = nextIndex;
    },
  }), [card, index, onDropCard, onMove]);

  drag(drop(previewRef));

  return (
    <div
      ref={previewRef}
      className={`transition-[opacity,transform] duration-150 ${
        isDragging ? "opacity-0 scale-[0.98]" : "opacity-100"
      }`}
    >
      <BoardCardView
        card={card}
        isDragging={isDragging}
        dragHandleProps={{
          ref: () => undefined,
          onMouseDown: (event) => {
            event.preventDefault();
          },
        }}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </div>
  );
}

function BoardColumn({
  columnId,
  label,
  cards,
  isActiveDrop,
  onMove,
  onDropCard,
  onDragStart,
  onDragEnd,
  onEdit,
  onDelete,
}: BoardColumnProps & {
  onMove: (cardId: string, column: BoardColumnId, index: number) => void;
  onDropCard: (cardId: string, column: BoardColumnId, index: number) => void;
  onDragStart: (card: BoardCard) => void;
  onDragEnd: (nextCards?: BoardCard[]) => void;
}) {
  const [{ isOver }, drop] = useDrop<BoardDragItem, void, { isOver: boolean }>(() => ({
    accept: "board-card",
    hover: (item) => {
      if (cards.length > 0) {
        return;
      }
      if (item.column !== columnId || item.hoverIndex !== 0) {
        onMove(item.cardId, columnId, 0);
        item.column = columnId;
        item.hoverIndex = 0;
      }
    },
    drop: (item, monitor) => {
      if (monitor.didDrop()) {
        return;
      }
      onDropCard(item.cardId, columnId, 0);
      item.column = columnId;
      item.index = 0;
      item.hoverIndex = 0;
    },
    collect: (monitor) => ({
      isOver: monitor.isOver({ shallow: true }),
    }),
  }), [cards.length, columnId, onDropCard, onMove]);

  return (
    <div
      className={`flex min-h-0 flex-col rounded-2xl border bg-background transition-[border-color,background,box-shadow] ${
        isActiveDrop || isOver
          ? "border-christi bg-christi/8 shadow-[0_0_0_1px_rgba(121,168,18,0.14)]"
          : "border-border"
      }`}
    >
      <div className="flex items-center justify-between border-b border-border/80 px-3 py-2.5">
        <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-text-muted">
          {label}
        </div>
        <div className="rounded-full bg-surface px-2 py-0.5 text-[0.68rem] text-text-secondary">
          {cards.length}
        </div>
      </div>
      <div
        ref={(node) => {
          drop(node);
        }}
        className="min-h-0 flex-1 overflow-auto p-3"
      >
        <div className="flex flex-col gap-3">
          {cards.length > 0 ? (
            cards.map((card, index) => (
              <DraggableBoardCard
                key={card.id}
                card={card}
                index={index}
                onMove={onMove}
                onDropCard={onDropCard}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))
          ) : (
            <div className={`rounded-2xl border border-dashed px-3 py-6 text-center text-xs transition-colors ${
              isActiveDrop || isOver
                ? "border-christi bg-christi/8 text-christi"
                : "border-border text-text-secondary"
            }`}>
              Drop a card here.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const LIGHT_ANSI = {
  black: "#1c1917",
  red: "#b91c1c",
  green: "#15803d",
  yellow: "#a16207",
  blue: "#1d4ed8",
  magenta: "#7e22ce",
  cyan: "#0e7490",
  white: "#fafaf9",
  brightBlack: "#57534e",
  brightRed: "#dc2626",
  brightGreen: "#16a34a",
  brightYellow: "#ca8a04",
  brightBlue: "#2563eb",
  brightMagenta: "#9333ea",
  brightCyan: "#0891b2",
  brightWhite: "#f5f5f4",
};

const DARK_ANSI = {
  black: "#e5e7eb",
  red: "#f87171",
  green: "#4ade80",
  yellow: "#facc15",
  blue: "#60a5fa",
  magenta: "#c084fc",
  cyan: "#22d3ee",
  white: "#0a0c14",
  brightBlack: "#9ca3af",
  brightRed: "#fca5a5",
  brightGreen: "#86efac",
  brightYellow: "#fde047",
  brightBlue: "#93c5fd",
  brightMagenta: "#d8b4fe",
  brightCyan: "#67e8f9",
  brightWhite: "#1f2937",
};

function buildTerminalTheme(isDark: boolean) {
  return {
    background: isDark ? "#0a0c14" : "#fafaf9",
    foreground: isDark ? "#d1fae5" : "#1c1917",
    cursor: isDark ? "#86efac" : "#426706",
    cursorAccent: isDark ? "#0a0c14" : "#fafaf9",
    selectionBackground: isDark
      ? "rgba(34, 197, 94, 0.18)"
      : "rgba(66, 103, 6, 0.14)",
    ...(isDark ? DARK_ANSI : LIGHT_ANSI),
  };
}

export default function TerminalWorkspace() {
  const [bootstrap, setBootstrap] = useState<TerminalBootstrap | null>(null);
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [browserWidth, setBrowserWidth] = useState(400);
  const [previewWidth, setPreviewWidth] = useState(0.5);
  const [fileEntries, setFileEntries] = useState<FileTreeEntry[]>([]);
  const [fileTreeLoading, setFileTreeLoading] = useState(false);
  const [browserPath, setBrowserPath] = useState<string | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [filePreview, setFilePreview] = useState<FilePreview | null>(null);
  const [filePreviewLoading, setFilePreviewLoading] = useState(false);
  const [previewLanguageReady, setPreviewLanguageReady] = useState(false);
  const [expandedDirs, setExpandedDirs] = useState<
    Record<string, FileTreeEntry[]>
  >({});
  const [expandedLoading, setExpandedLoading] = useState<
    Record<string, boolean>
  >({});
  const [treeScrollTop, setTreeScrollTop] = useState(0);
  const [treeViewportHeight, setTreeViewportHeight] = useState(320);
  const [sideTab, setSideTab] = useState<WorkspaceSideTab>("preview");
  const [boardCards, setBoardCards] = useState<BoardCard[]>(INITIAL_BOARD_CARDS);
  const [boardDialogOpen, setBoardDialogOpen] = useState(false);
  const [boardEditingId, setBoardEditingId] = useState<string | null>(null);
  const [boardDraftTitle, setBoardDraftTitle] = useState("");
  const [boardDraftNote, setBoardDraftNote] = useState("");
  const [boardDraftPriority, setBoardDraftPriority] = useState<BoardPriority>("medium");
  const [boardDraftColor, setBoardDraftColor] = useState<BoardColor>("gold");
  const [boardDraftTags, setBoardDraftTags] = useState("");
  const [boardDragState, setBoardDragState] = useState<BoardDragState | null>(null);
  const [boardLoading, setBoardLoading] = useState(true);
  const [boardSaving, setBoardSaving] = useState(false);
  const { t } = useTranslation();
  const { theme } = useTheme();
  const isDarkTheme = theme === "dark";
  const defaultTabTitle = "Terminal";
  const terminalHostRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const browserPaneRef = useRef<HTMLDivElement>(null);
  const treeViewportRef = useRef<HTMLDivElement>(null);
  const tabsScrollerRef = useRef<HTMLDivElement>(null);
  const panesRef = useRef<Record<string, TerminalPane>>({});
  const sessionToTabRef = useRef<Record<string, string>>({});
  const tabsRef = useRef<TerminalTab[]>([]);
  const closeTabRef = useRef<(tabId: string) => Promise<void>>(() =>
    Promise.resolve(),
  );
  const rootListRequestRef = useRef(0);
  const previewRequestRef = useRef(0);
  const expandRequestRef = useRef<Record<string, number>>({});
  const isComposingRef = useRef(false);
  const initialTabCreatedRef = useRef(false);
  const creatingInitialTabRef = useRef(false);
  const bootstrappedRef = useRef(false);

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [tabs, activeTabId],
  );
  const browserRoot = activeTab?.cwd ?? bootstrap?.cwd ?? null;
  const effectiveBrowserPath = browserPath ?? browserRoot;
  const previewCodeConfig = useMemo(
    () => (filePreview ? getCodePreviewConfig(filePreview.path) : null),
    [filePreview],
  );
  const codePreviewTheme = useMemo(
    () => buildCodePreviewTheme(isDarkTheme),
    [isDarkTheme],
  );
  const boardCardsByColumn = useMemo(
    () =>
      BOARD_COLUMNS.map((column) => ({
        ...column,
        cards: boardCards.filter((card) => card.column === column.id),
      })),
    [boardCards],
  );
  const serializeBoardCards = useCallback(
    (cards: BoardCard[]): TerminalBoardCard[] =>
      cards.map((card) => ({
        id: card.id,
        title: card.title,
        note: card.note,
        column: card.column,
        priority: card.priority,
        color: card.color,
        tags: card.tags,
      })),
    [],
  );

  const normalizeBoardCards = useCallback(
    (cards: TerminalBoardCard[]): BoardCard[] => {
      const validColumns = new Set<BoardColumnId>(["inbox", "doing", "done"]);
      const validPriorities = new Set<BoardPriority>(["low", "medium", "high"]);
      const validColors = new Set<BoardColor>(["leaf", "gold", "coral", "sky"]);
      const normalized = cards
        .filter((card) => card.id && card.title)
        .map((card) => ({
          id: card.id,
          title: card.title,
          note: card.note ?? "",
          column: validColumns.has(card.column as BoardColumnId)
            ? (card.column as BoardColumnId)
            : "inbox",
          priority: validPriorities.has(card.priority as BoardPriority)
            ? (card.priority as BoardPriority)
            : "medium",
          color: validColors.has(card.color as BoardColor)
            ? (card.color as BoardColor)
            : "gold",
          tags: Array.isArray(card.tags)
            ? card.tags
                .map((tag) => String(tag).trim())
                .filter(Boolean)
                .slice(0, 6)
            : [],
        }));

      return normalized.length > 0 ? normalized : INITIAL_BOARD_CARDS;
    },
    [],
  );

  const treeNodes = useMemo(() => {
    const result: TreeNode[] = [];

    const walk = (entries: FileTreeEntry[], depth: number) => {
      for (const entry of entries) {
        result.push({ entry, depth });
        if (entry.is_dir && expandedDirs[entry.path]) {
          walk(expandedDirs[entry.path], depth + 1);
        }
      }
    };

    walk(fileEntries, 0);
    return result;
  }, [expandedDirs, fileEntries]);
  const totalTreeHeight = treeNodes.length * TREE_ROW_HEIGHT;
  const treeStartIndex = Math.max(
    0,
    Math.floor(treeScrollTop / TREE_ROW_HEIGHT) - TREE_OVERSCAN,
  );
  const treeEndIndex = Math.min(
    treeNodes.length,
    Math.ceil((treeScrollTop + treeViewportHeight) / TREE_ROW_HEIGHT) +
      TREE_OVERSCAN,
  );
  const visibleTreeNodes = treeNodes.slice(treeStartIndex, treeEndIndex);

  const sendTerminalCommand = useCallback(
    async (command: string) => {
      if (!activeTab) {
        return;
      }

      try {
        await invoke("terminal_write", {
          req: {
            sessionId: activeTab.sessionId,
            data: `${command}\r`,
          },
        });
      } catch (err) {
        setError(String(err));
      }
    },
    [activeTab],
  );

  const syncTerminalDirectory = useCallback(
    async (targetPath: string) => {
      const escaped = targetPath.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      await sendTerminalCommand(`cd "${escaped}"`);
    },
    [sendTerminalCommand],
  );

  useEffect(() => {
    tabsRef.current = tabs;
    if (tabs.length > 0) {
      initialTabCreatedRef.current = true;
    }
  }, [tabs]);

  useEffect(() => {
    const newTheme = buildTerminalTheme(isDarkTheme);
    for (const pane of Object.values(panesRef.current)) {
      pane.terminal.options.theme = newTheme;
    }
  }, [isDarkTheme]);

  const createTerminalPane = useCallback(
    (tabId: string) => {
      const pane = panesRef.current[tabId];
      if (pane) {
        return pane;
      }

      const terminal = new Terminal({
        cursorBlink: true,
        cursorStyle: "block",
        fontFamily:
          '"IBM Plex Mono", "SFMono-Regular", Menlo, Monaco, Consolas, monospace',
        fontSize: 14,
        theme: buildTerminalTheme(isDarkTheme),
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
    },
    [isDarkTheme],
  );

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

        const textarea = pane.terminal.textarea as
          | GuardedTerminalTextArea
          | undefined;
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
            if (
              inputData === committed ||
              (inputData === " " && committed.length > 0)
            ) {
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

          textarea.addEventListener(
            "compositionstart",
            handleCompositionStart,
            true,
          );
          textarea.addEventListener(
            "compositionupdate",
            handleCompositionUpdate,
            true,
          );
          textarea.addEventListener(
            "compositionend",
            handleCompositionEnd,
            true,
          );
          textarea.addEventListener("input", handleInput, true);
          textarea.addEventListener("blur", handleBlur, true);

          pane.compositionCleanup = () => {
            textarea.removeEventListener(
              "compositionstart",
              handleCompositionStart,
              true,
            );
            textarea.removeEventListener(
              "compositionupdate",
              handleCompositionUpdate,
              true,
            );
            textarea.removeEventListener(
              "compositionend",
              handleCompositionEnd,
              true,
            );
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
    [activeTabId, tabs],
  );

  useEffect(() => {
    closeTabRef.current = closeTab;
  }, [closeTab]);

  useEffect(() => {
    invoke<TerminalBoardCard[]>("get_terminal_board")
      .then((cards) => {
        setBoardCards(normalizeBoardCards(cards));
      })
      .catch((err) => {
        toast.error(String(err));
      })
      .finally(() => {
        setBoardLoading(false);
      });
  }, [normalizeBoardCards]);

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

    invoke<AgentStatus[]>("detect_agents")
      .then((value) => {
        setAgents(value);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (
      !bootstrap ||
      tabs.length > 0 ||
      creatingInitialTabRef.current ||
      initialTabCreatedRef.current
    ) {
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
      unlistenOutput = await listen<TerminalEvent>(
        "terminal://output",
        (event) => {
          const payload = event.payload;
          const tabId = sessionToTabRef.current[payload.session_id];
          if (!tabId) {
            return;
          }
          const pane = panesRef.current[tabId];
          const parsed = extractCwdFromChunk(payload.chunk);
          if (parsed.chunk) {
            pane?.terminal.write(parsed.chunk);
          }
          const nextCwd = parsed.cwd ?? payload.cwd ?? null;
          if (nextCwd) {
            setTabs((current) =>
              current.map((tab) =>
                tab.id === tabId
                  ? {
                      ...tab,
                      cwd: nextCwd,
                      title: tab.title.startsWith(defaultTabTitle)
                        ? folderLabel(nextCwd, defaultTabTitle)
                        : tab.title,
                    }
                  : tab,
              ),
            );
          }
        },
      );

      unlistenExit = await listen<TerminalEvent>("terminal://exit", (event) => {
        const payload = event.payload;
        const tabId = sessionToTabRef.current[payload.session_id];
        if (!tabId) {
          return;
        }
        const pane = panesRef.current[tabId];
        const suffix =
          payload.exit_code != null
            ? t("terminal.exitCodeSuffix", { code: payload.exit_code })
            : "";
        pane?.terminal.writeln(
          `\r\n${t("terminal.processExited", { suffix })}`,
        );
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
        void invoke("terminal_close_session", {
          sessionId: tab.sessionId,
        }).catch(() => undefined);
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
      const horizontalDelta =
        Math.abs(event.deltaX) > Math.abs(event.deltaY)
          ? event.deltaX
          : event.deltaY;
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
    const observer = host ? new ResizeObserver(() => doResize()) : null;
    observer?.observe(host!);

    window.addEventListener("resize", doResize);
    return () => {
      clearTimeout(timer);
      observer?.disconnect();
      window.removeEventListener("resize", doResize);
    };
  }, [activeTab, mountActiveTerminal]);

  useEffect(() => {
    if (!activeTab?.cwd) {
      setFileEntries([]);
      setBrowserPath(null);
      setSelectedFilePath(null);
      setFilePreview(null);
      setPreviewLanguageReady(false);
      return;
    }
    setBrowserPath(activeTab.cwd);
    setSelectedFilePath(null);
    setFilePreview(null);
    setPreviewLanguageReady(false);
    setExpandedDirs({});
    setTreeScrollTop(0);
    treeViewportRef.current?.scrollTo({ top: 0 });
  }, [activeTab?.cwd]);

  useEffect(() => {
    if (!effectiveBrowserPath) {
      setFileEntries([]);
      return;
    }

    const requestId = ++rootListRequestRef.current;
    setFileTreeLoading(true);
    invoke<FileTreeEntry[]>("terminal_list_directory", {
      cwd: effectiveBrowserPath,
    })
      .then((entries) => {
        if (requestId !== rootListRequestRef.current) {
          return;
        }
        setFileEntries(entries);
      })
      .catch((err) => {
        if (requestId !== rootListRequestRef.current) {
          return;
        }
        setError(String(err));
      })
      .finally(() => {
        if (requestId !== rootListRequestRef.current) {
          return;
        }
        setFileTreeLoading(false);
      });
  }, [effectiveBrowserPath]);

  useEffect(() => {
    if (!selectedFilePath) {
      setFilePreview(null);
      setPreviewLanguageReady(false);
      return;
    }

    const requestId = ++previewRequestRef.current;
    setFilePreviewLoading(true);
    invoke<FilePreview>("terminal_read_file_preview", {
      path: selectedFilePath,
    })
      .then((preview) => {
        if (requestId !== previewRequestRef.current) {
          return;
        }
        setFilePreview(preview);
      })
      .catch((err) => {
        if (requestId !== previewRequestRef.current) {
          return;
        }
        setError(String(err));
      })
      .finally(() => {
        if (requestId !== previewRequestRef.current) {
          return;
        }
        setFilePreviewLoading(false);
      });
  }, [selectedFilePath]);

  useEffect(() => {
    if (!previewCodeConfig) {
      setPreviewLanguageReady(false);
      return;
    }

    if (loadedPreviewLanguages.has(previewCodeConfig.language)) {
      setPreviewLanguageReady(true);
      return;
    }

    let cancelled = false;
    setPreviewLanguageReady(false);

    previewCodeConfig
      .loader()
      .then((module) => {
        if (cancelled) {
          return;
        }
        AsyncSyntaxHighlighter.registerLanguage(
          previewCodeConfig.language,
          module.default,
        );
        loadedPreviewLanguages.add(previewCodeConfig.language);
        setPreviewLanguageReady(true);
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }
        setError(String(err));
        setPreviewLanguageReady(false);
      });

    return () => {
      cancelled = true;
    };
  }, [previewCodeConfig]);

  useEffect(() => {
    const viewport = treeViewportRef.current;
    if (!viewport || typeof ResizeObserver === "undefined") {
      return;
    }

    const updateHeight = () => {
      setTreeViewportHeight(viewport.clientHeight);
    };

    updateHeight();
    const observer = new ResizeObserver(() => updateHeight());
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  const startResizeBrowser = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault();

      const startX = event.clientX;
      const startWidth = browserWidth;
      const workspaceRect = workspaceRef.current?.getBoundingClientRect();
      const maxWidth = workspaceRect
        ? Math.min(980, workspaceRect.width - 180)
        : 980;

      const handleMove = (moveEvent: MouseEvent) => {
        const delta = startX - moveEvent.clientX;
        const next = Math.max(280, Math.min(maxWidth, startWidth + delta));
        setBrowserWidth(next);
      };

      const handleUp = () => {
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
      };

      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
    },
    [browserWidth],
  );

  const startResizePreview = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault();

      const startX = event.clientX;
      const paneRect = browserPaneRef.current?.getBoundingClientRect();
      if (!paneRect) {
        return;
      }
      const startRatio = previewWidth;

      const handleMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startX;
        const nextPreviewWidth = paneRect.width * startRatio - delta;
        const nextRatio = nextPreviewWidth / paneRect.width;
        setPreviewWidth(Math.max(0.28, Math.min(0.72, nextRatio)));
      };

      const handleUp = () => {
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
      };

      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
    },
    [previewWidth],
  );

  const toggleDirectory = useCallback(
    async (entry: FileTreeEntry) => {
      if (!entry.is_dir) {
        return;
      }

      if (expandedDirs[entry.path]) {
        setExpandedDirs((current) => {
          const next = { ...current };
          delete next[entry.path];
          return next;
        });
        return;
      }

      setExpandedLoading((current) => ({ ...current, [entry.path]: true }));
      const requestId = (expandRequestRef.current[entry.path] ?? 0) + 1;
      expandRequestRef.current[entry.path] = requestId;
      try {
        const entries = await invoke<FileTreeEntry[]>(
          "terminal_list_directory",
          { cwd: entry.path },
        );
        if (expandRequestRef.current[entry.path] !== requestId) {
          return;
        }
        setExpandedDirs((current) => ({ ...current, [entry.path]: entries }));
      } catch (err) {
        if (expandRequestRef.current[entry.path] !== requestId) {
          return;
        }
        setError(String(err));
      } finally {
        if (expandRequestRef.current[entry.path] !== requestId) {
          return;
        }
        setExpandedLoading((current) => {
          const next = { ...current };
          delete next[entry.path];
          return next;
        });
      }
    },
    [expandedDirs],
  );

  const openEntry = useCallback(
    (entry: FileTreeEntry) => {
      if (entry.is_dir) {
        void toggleDirectory(entry);
        return;
      }

      setSelectedFilePath(entry.path);
    },
    [toggleDirectory],
  );

  const openEntryInTerminal = useCallback(
    async (entry: FileTreeEntry) => {
      if (entry.is_dir) {
        await syncTerminalDirectory(entry.path);
        return;
      }

      setSelectedFilePath(entry.path);
    },
    [syncTerminalDirectory],
  );

  const persistBoardCards = useCallback(
    async (cards: BoardCard[]) => {
      setBoardSaving(true);
      try {
        const saved = await invoke<TerminalBoardCard[]>("save_terminal_board", {
          cards: serializeBoardCards(cards),
        });
        setBoardCards(normalizeBoardCards(saved));
      } catch (err) {
        toast.error(String(err));
      } finally {
        setBoardSaving(false);
      }
    },
    [normalizeBoardCards, serializeBoardCards],
  );

  const moveBoardCardLocally = useCallback(
    (cardId: string, targetColumn: BoardColumnId, targetIndex: number) => {
      setBoardCards((current) => reorderBoardCards(current, cardId, targetColumn, targetIndex));
    },
    [],
  );

  const moveBoardCardAndPersist = useCallback(
    (cardId: string, targetColumn: BoardColumnId, targetIndex: number) => {
      setBoardCards((current) => {
        const next = reorderBoardCards(current, cardId, targetColumn, targetIndex);
        queueMicrotask(() => {
          void persistBoardCards(next);
        });
        return next;
      });
      setBoardDragState(null);
    },
    [persistBoardCards],
  );

  const handleBoardDragStart = useCallback((card: BoardCard) => {
    setBoardDragState({
      cardId: card.id,
      sourceColumn: card.column,
    });
  }, []);

  const handleBoardDragEnd = useCallback(() => {
    setBoardDragState(null);
  }, []);

  const resetBoardDialog = useCallback(() => {
    setBoardDialogOpen(false);
    setBoardEditingId(null);
    setBoardDraftTitle("");
    setBoardDraftNote("");
    setBoardDraftPriority("medium");
    setBoardDraftColor("gold");
    setBoardDraftTags("");
  }, []);

  const openCreateBoardDialog = useCallback(() => {
    setBoardEditingId(null);
    setBoardDraftTitle("");
    setBoardDraftNote("");
    setBoardDraftPriority("medium");
    setBoardDraftColor("gold");
    setBoardDraftTags("");
    setBoardDialogOpen(true);
    setSideTab("board");
  }, []);

  const openEditBoardDialog = useCallback((card: BoardCard) => {
    setBoardEditingId(card.id);
    setBoardDraftTitle(card.title);
    setBoardDraftNote(card.note);
    setBoardDraftPriority(card.priority);
    setBoardDraftColor(card.color);
    setBoardDraftTags(card.tags.join(", "));
    setBoardDialogOpen(true);
  }, []);

  const submitBoardCard = useCallback(() => {
    const title = boardDraftTitle.trim();
    const note = boardDraftNote.trim();
    if (!title) {
      return;
    }

    const priority = boardDraftPriority;
    const color = boardDraftColor;
    const tags = boardDraftTags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 6);

    const nextCards: BoardCard[] = boardEditingId
      ? boardCards.map((card) =>
          card.id === boardEditingId
            ? { ...card, title, note, priority, color, tags }
            : card,
        )
      : [
          {
            id: crypto.randomUUID(),
            title,
            note,
            column: "inbox",
            priority,
            color,
            tags,
          },
          ...boardCards,
        ];

    setBoardCards(nextCards);
    void persistBoardCards(nextCards);
    resetBoardDialog();
    setSideTab("board");
  }, [
    boardCards,
    boardDraftColor,
    boardDraftNote,
    boardDraftPriority,
    boardDraftTags,
    boardDraftTitle,
    boardEditingId,
    persistBoardCards,
    resetBoardDialog,
  ]);

  const deleteBoardCard = useCallback(
    (cardId: string) => {
      const nextCards = boardCards.filter((card) => card.id !== cardId);
      setBoardCards(nextCards);
      void persistBoardCards(nextCards);
      if (boardEditingId === cardId) {
        resetBoardDialog();
      }
    },
    [boardCards, boardEditingId, persistBoardCards, resetBoardDialog],
  );


  return (
    <section
      className="flex h-full flex-col"
      style={{
        background: `radial-gradient(circle at top left, rgba(121, 168, 18, 0.08), transparent 32%), linear-gradient(180deg, rgba(17, 24, 39, 0.02), transparent 22%), var(--color-background)`,
      }}
    >
      <div
        ref={workspaceRef}
        className="grid min-h-0 flex-1 gap-4 p-4"
        style={{ gridTemplateColumns: `minmax(0, 1fr) ${browserWidth}px` }}
      >
        <div className="flex min-h-0 min-w-0 flex-col">
          <div className="flex items-center gap-2 pb-2.5">
            <div
              ref={tabsScrollerRef}
              className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
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
                    <span className="min-w-0 flex-1 truncate text-left">
                      {tab.title}
                    </span>
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
            <div className="border-b border-white/5 px-4 py-2 flex items-center gap-3 text-xs text-text-muted">
              <span className="shrink-0">
                {activeTab ? activeTab.shell : t("terminal.loadingShell")}
              </span>
              {agents.length > 0 && (
                <>
                  <span className="text-border">|</span>
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    <span className="shrink-0">{t("terminal.agents")}:</span>
                    {agents.map((agent) => (
                      <span
                        key={agent.name}
                        className={`inline-flex items-center gap-0.5 shrink-0 ${
                          agent.installed
                            ? "text-christi"
                            : "text-text-muted/50"
                        }`}
                        title={
                          agent.installed
                            ? agent.label
                            : t("terminal.notInstalled", { agent: agent.label })
                        }
                      >
                        <span className="text-[0.6rem]">
                          {agent.installed ? "●" : "○"}
                        </span>
                        <span className="max-w-[4.5rem] truncate">
                          {agent.label}
                        </span>
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
            {error && (
              <div className="mx-4 mt-4 mb-0 rounded-xl bg-red-500/16 px-3.5 py-3 text-[#fecaca] border border-red-400/28">
                {error}
              </div>
            )}
            <div
              ref={terminalHostRef}
              className="terminal-canvas relative flex-1 min-h-0 overflow-hidden"
            />
          </div>
        </div>

        <aside className="relative min-h-0 min-w-0">
          <div
            role="separator"
            aria-orientation="vertical"
            onMouseDown={startResizeBrowser}
            className="absolute -left-2 top-0 z-10 h-full w-4 cursor-col-resize"
            title="Drag to resize file browser"
          >
            <div className="mx-auto h-full w-px bg-border/80" />
          </div>
          <div className="flex min-h-0 h-full min-w-0 flex-col rounded-[18px] border border-border/80 bg-surface/95 shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-border/80 px-4 py-3">
              <div className="min-w-0">
                <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-text-muted">
                  Explorer
                </div>
                <div className="mt-1 truncate text-xs text-text-secondary">
                  {effectiveBrowserPath ?? "—"}
                </div>
              </div>
              <div className="min-w-0 text-right">
                <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-text-muted">
                  Selection
                </div>
                <div className="mt-1 truncate text-xs text-text-secondary">
                  {filePreview?.path ?? "No file selected"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 border-b border-border/80 px-4 py-2.5">
              {[
                { id: "preview", label: "Preview" },
                { id: "board", label: "Board" },
              ].map((tab) => {
                const isActive = sideTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSideTab(tab.id as WorkspaceSideTab)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] transition cursor-pointer ${
                      isActive
                        ? "border-christi/35 bg-christi/10 text-christi"
                        : "border-border bg-background text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
            {sideTab === "preview" ? (
              <div
                ref={browserPaneRef}
                className="grid min-h-0 h-full min-w-0"
                style={{
                  gridTemplateColumns: `minmax(0, ${1 - previewWidth}fr) minmax(0, ${previewWidth}fr)`,
                }}
              >
                <div className="flex min-h-0 min-w-0 flex-col p-4">
                  <div
                    ref={treeViewportRef}
                    onScroll={(event) =>
                      setTreeScrollTop(event.currentTarget.scrollTop)
                    }
                    className="min-h-0 overflow-auto rounded-2xl border border-border bg-background"
                  >
                    {fileTreeLoading ? (
                      <div className="px-3.5 py-4 text-sm text-text-secondary">
                        Loading files...
                      </div>
                    ) : fileEntries.length > 0 ? (
                      <div
                        style={{
                          height: totalTreeHeight || TREE_ROW_HEIGHT,
                          position: "relative",
                        }}
                      >
                        {visibleTreeNodes.map(({ entry, depth }, index) => (
                          <TreeRow
                            key={entry.path}
                            entry={entry}
                            isSelected={selectedFilePath === entry.path}
                            isExpanded={Boolean(expandedDirs[entry.path])}
                            isLoading={Boolean(expandedLoading[entry.path])}
                            onOpen={openEntry}
                            onOpenInTerminal={openEntryInTerminal}
                            style={{
                              position: "absolute",
                              top: (treeStartIndex + index) * TREE_ROW_HEIGHT,
                              left: 0,
                              right: 0,
                              height: TREE_ROW_HEIGHT,
                              paddingLeft: `${14 + depth * 16}px`,
                            }}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="px-3.5 py-4 text-sm text-text-secondary">
                        No files found for the current terminal path.
                      </div>
                    )}
                  </div>
                  <div className="mt-3 text-xs leading-5 text-text-secondary">
                    Rooted to the active terminal working directory. Use each
                    folder's `cd` action when you want the shell to jump there.
                  </div>
                </div>

                <div className="relative flex min-h-0 min-w-0 flex-col border-l border-border/80 p-4">
                  <div
                    role="separator"
                    aria-orientation="vertical"
                    onMouseDown={startResizePreview}
                    className="absolute -left-2 top-0 z-10 h-full w-4 cursor-col-resize"
                    title="Drag to resize preview"
                  >
                    <div className="mx-auto h-full w-px bg-border/80" />
                  </div>
                  <div className="min-h-0 flex-1 rounded-2xl border border-border bg-background">
                    {filePreviewLoading ? (
                      <div className="px-3.5 py-4 text-sm text-text-secondary">
                        Loading preview...
                      </div>
                    ) : filePreview ? (
                      <div className="flex h-full min-h-0 flex-col px-3.5 py-3">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <div className="min-w-0 text-xs text-text-secondary break-all">
                            {filePreview.path}
                          </div>
                          {previewCodeConfig ? (
                            <span
                              className={`shrink-0 rounded-full border px-2 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.14em] ${
                                isDarkTheme
                                  ? "border-christi/25 bg-christi/10 text-[#d7ff93]"
                                  : "border-christi/20 bg-christi/8 text-[#426706]"
                              }`}
                            >
                              {previewCodeConfig.label}
                            </span>
                          ) : null}
                        </div>
                        {previewCodeConfig ? (
                          <div
                            className={`min-h-0 flex-1 overflow-auto rounded-xl border px-3 py-2 ${
                              isDarkTheme
                                ? "border-white/8 bg-[#0c111b]"
                                : "border-black/6 bg-[#f8faf7]"
                            }`}
                          >
                            {previewLanguageReady ? (
                              <AsyncSyntaxHighlighter
                                language={previewCodeConfig.language}
                                style={isDarkTheme ? nnfxDark : stackoverflowLight}
                                customStyle={codePreviewTheme}
                                wrapLongLines
                                showLineNumbers={false}
                                codeTagProps={{
                                  style: {
                                    fontFamily:
                                      '"IBM Plex Mono", "SFMono-Regular", Menlo, Monaco, Consolas, monospace',
                                  },
                                }}
                              >
                                {filePreview.content}
                              </AsyncSyntaxHighlighter>
                            ) : (
                              <div className="flex h-full min-h-[8rem] items-center justify-center text-xs text-text-secondary">
                                Loading syntax highlighting...
                              </div>
                            )}
                          </div>
                        ) : (
                          <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-text-primary">
                            {filePreview.content}
                          </pre>
                        )}
                        {filePreview.truncated ? (
                          <div className="mt-2 text-[0.68rem] text-text-secondary">
                            Preview truncated for large files.
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="px-3.5 py-4 text-sm text-text-secondary">
                        Select a file to preview its text content here.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="flex min-h-0 h-full min-w-0 flex-col p-4">
                  <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background px-4 py-3">
                    <div>
                      <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-text-muted">
                        Kanban
                      </div>
                      <div className="mt-1 text-sm text-text-secondary">
                        Keep work moving without leaving the terminal.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={openCreateBoardDialog}
                      onDoubleClick={openCreateBoardDialog}
                      className="inline-flex items-center gap-2 rounded-full bg-christi px-4 py-2 text-sm font-semibold text-white transition hover:brightness-105 cursor-pointer"
                    >
                      <Plus className="h-4 w-4" />
                      New task
                    </button>
                  </div>
                  <div className="mt-3 text-xs text-text-secondary">
                    {boardLoading
                      ? "Loading board..."
                      : boardSaving
                        ? "Saving board changes..."
                        : "Board changes are saved for your next session."}
                  </div>
                  <DndProvider backend={HTML5Backend}>
                    <div
                      className="mt-4 grid min-h-0 flex-1 gap-3 xl:grid-cols-3 select-none"
                      onDoubleClick={(event) => {
                        if (event.target === event.currentTarget) {
                          openCreateBoardDialog();
                        }
                      }}
                    >
                      {boardCardsByColumn.map((column) => (
                        <BoardColumn
                          key={column.id}
                          columnId={column.id}
                          label={column.label}
                          cards={column.cards}
                          isActiveDrop={boardDragState?.sourceColumn !== column.id && boardDragState !== null}
                          onMove={moveBoardCardLocally}
                          onDropCard={moveBoardCardAndPersist}
                          onDragStart={handleBoardDragStart}
                          onDragEnd={handleBoardDragEnd}
                          onEdit={openEditBoardDialog}
                          onDelete={deleteBoardCard}
                        />
                      ))}
                    </div>
                    <BoardDragPreview />
                  </DndProvider>
                </div>
                <Dialog.Root
                  open={boardDialogOpen}
                  onOpenChange={(open) => {
                    if (!open) {
                      resetBoardDialog();
                      return;
                    }
                    setBoardDialogOpen(true);
                  }}
                >
                  <Dialog.Portal>
                    <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
                    <Dialog.Content
                      onEscapeKeyDown={() => resetBoardDialog()}
                      className="fixed left-1/2 top-1/2 z-50 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-surface p-5 shadow-xl"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <Dialog.Title className="text-base font-semibold text-text-primary">
                            {boardEditingId ? "Edit task" : "Create task"}
                          </Dialog.Title>
                          <Dialog.Description className="mt-1 text-sm text-text-secondary">
                            Capture the next thing you want to move through the board.
                          </Dialog.Description>
                        </div>
                        <Dialog.Close asChild>
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition hover:bg-background hover:text-text-primary cursor-pointer"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </Dialog.Close>
                      </div>
                      <div className="mt-5 grid gap-3">
                        <input
                          autoFocus
                          value={boardDraftTitle}
                          onChange={(event) => setBoardDraftTitle(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey) {
                              event.preventDefault();
                              submitBoardCard();
                              return;
                            }
                            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                              event.preventDefault();
                              submitBoardCard();
                            }
                          }}
                          placeholder="Task title"
                          className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-text-primary outline-none"
                        />
                        <textarea
                          value={boardDraftNote}
                          onChange={(event) => setBoardDraftNote(event.target.value)}
                          onKeyDown={(event) => {
                            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                              event.preventDefault();
                              submitBoardCard();
                            }
                          }}
                          placeholder="Optional note"
                          rows={5}
                          className="resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-text-primary outline-none"
                        />
                        <input
                          value={boardDraftTags}
                          onChange={(event) => setBoardDraftTags(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey) {
                              event.preventDefault();
                              submitBoardCard();
                            }
                          }}
                          placeholder="Tags, separated by commas"
                          className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-text-primary outline-none"
                        />
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                            Priority
                            <select
                              value={boardDraftPriority}
                              onChange={(event) =>
                                setBoardDraftPriority(event.target.value as BoardPriority)
                              }
                              className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-medium text-text-primary outline-none"
                            >
                              {BOARD_PRIORITY_OPTIONS.map((priority) => (
                                <option key={priority} value={priority}>
                                  {BOARD_PRIORITY_LABELS[priority]}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                            Color
                            <select
                              value={boardDraftColor}
                              onChange={(event) =>
                                setBoardDraftColor(event.target.value as BoardColor)
                              }
                              className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-medium text-text-primary outline-none"
                            >
                              {BOARD_COLOR_OPTIONS.map((color) => (
                                <option key={color} value={color}>
                                  {BOARD_COLOR_LABELS[color]}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      </div>
                      <div className="mt-5 flex items-center justify-end gap-2">
                        <Dialog.Close asChild>
                          <button
                            type="button"
                            className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-text-secondary transition hover:text-text-primary cursor-pointer"
                          >
                            Cancel
                          </button>
                        </Dialog.Close>
                        <button
                          type="button"
                          onClick={submitBoardCard}
                          disabled={boardSaving || !boardDraftTitle.trim()}
                          className="rounded-lg bg-christi px-4 py-2 text-sm font-semibold text-white transition hover:brightness-105 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                          title="Enter"
                        >
                          {boardSaving
                            ? "Saving..."
                            : boardEditingId
                              ? "Save changes"
                              : "Create task"}
                        </button>
                      </div>
                    </Dialog.Content>
                  </Dialog.Portal>
                </Dialog.Root>
              </>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}

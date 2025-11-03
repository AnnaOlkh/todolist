import "./App.css";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent, DragMoveEvent } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";

import { database } from "./firebase";
import {
  ref,
  onValue,
  set,
  remove,
  type DatabaseReference,
} from "firebase/database";

type Todo = {
  id: string;
  text: string;
  done: boolean;
  order: number;
  updatedAt: number;
  updatedBy: string;
};

type RemoteDragState = {
  itemId: string;
  overId: string | null;
  sessionId: string;
};

const clientId = (() => {
  const k = "client_id";
  let id = localStorage.getItem(k);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(k, id);
  }
  return id;
})();

const sessionId = Math.random().toString(36).slice(2, 9);

function SortableTodoItem({
  todo,
  onToggle,
  onDelete,
  remoteDrag,
}: {
  todo: Todo;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  remoteDrag: RemoteDragState | null;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: todo.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 5 : 1,
  };

  const isRemoteDragged = remoteDrag?.itemId === todo.id;
  const isRemoteOver = remoteDrag?.overId === todo.id;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={[
        "todo-item",
        todo.done ? "todo-item--done" : "",
        isRemoteDragged ? "todo-item--remote" : "",
        isRemoteOver ? "todo-item--remote-over" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <label className="todo-item__left">
        <input
          type="checkbox"
          className="todo-item__checkbox"
          checked={todo.done}
          onChange={() => onToggle(todo.id)}
          title="Mark as completed"
        />
        <span className="todo-item__text">{todo.text}</span>
      </label>

      <div className="todo-item__actions">
        <button
          type="button"
          className="icon-button icon-button--danger"
          onClick={() => onDelete(todo.id)}
          title="Delete"
        >
          ✕
        </button>
        <span
          className="drag-handle"
          title="Drag to reorder"
          aria-hidden="true"
          {...attributes}
          {...listeners}
        >
          ⠿
        </span>
      </div>
    </li>
  );
}

export default function App() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [text, setText] = useState("");
  const [remoteDrag, setRemoteDrag] = useState<RemoteDragState | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

  const todosRef = useRef<DatabaseReference | null>(null);
  const draggingRef = useRef<DatabaseReference | null>(null);

  if (todosRef.current === null) {
    todosRef.current = ref(database, "todos");
  }
  if (draggingRef.current === null) {
    draggingRef.current = ref(database, "dragging");
  }

  useEffect(() => {
    if (!todosRef.current) return;

    const unsubscribe = onValue(
      todosRef.current,
      (snapshot) => {
        const val = snapshot.val();
        if (!val) {
          setTodos([]);
          return;
        }
        const list = Object.values(val) as Todo[];
        list.sort((a, b) => a.order - b.order);
        setTodos(list);
      },
      (error) => {
        console.error("Firebase read error:", error);
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!draggingRef.current) return;

    const unsubscribe = onValue(
      draggingRef.current,
      (snapshot) => {
        const val = snapshot.val() as RemoteDragState | null;
        if (!val) {
          setRemoteDrag(null);
          return;
        }
        if (val.sessionId !== sessionId) {
          setRemoteDrag(val);
        } else {
          setRemoteDrag(null);
        }
      },
      (error) => {
        console.error("Firebase dragging read error:", error);
      }
    );

    return () => {
      unsubscribe();
      if (draggingRef.current) {
        remove(draggingRef.current).catch(() => {});
      }
    };
  }, []);

  const saveToFirebase = (newTodos: Todo[]) => {
    if (!todosRef.current) return;
    const data: Record<string, Todo> = {};
    newTodos.forEach((t) => {
      data[t.id] = t;
    });
    set(todosRef.current, data).catch((err) => {
      console.error("Firebase write error:", err);
    });
  };

  function addTodo() {
    const trimmed = text.trim();
    if (!trimmed) return;
    const maxOrder = todos.length ? Math.max(...todos.map((t) => t.order)) : 0;
    const newTodo: Todo = {
      id: crypto.randomUUID(),
      text: trimmed,
      done: false,
      order: maxOrder + 1,
      updatedAt: Date.now(),
      updatedBy: clientId,
    };
    const next = [...todos, newTodo];
    setTodos(next);
    saveToFirebase(next);
    setText("");
    inputRef.current?.focus();
  }

  function toggleTodo(id: string) {
    const next = todos.map((t) =>
      t.id === id
        ? { ...t, done: !t.done, updatedAt: Date.now(), updatedBy: clientId }
        : t
    );
    setTodos(next);
    saveToFirebase(next);
  }

  function deleteTodo(id: string) {
    const next = todos.filter((t) => t.id !== id);
    setTodos(next);
    saveToFirebase(next);
  }

  function handleDragStart(event: DragStartEvent) {
    if (!draggingRef.current) return;
    const { active } = event;
    set(draggingRef.current, {
      itemId: String(active.id),
      overId: null,
      sessionId,
    }).catch(() => {});
  }

  function handleDragMove(event: DragMoveEvent) {
    if (!draggingRef.current) return;
    const { active, over } = event;
    set(draggingRef.current, {
      itemId: String(active.id),
      overId: over ? String(over.id) : null,
      sessionId,
    }).catch(() => {});
  }

  function handleDragEnd(event: DragEndEvent) {
    // при завершенні перетягування — прибираємо drag-стан
    if (draggingRef.current) {
      remove(draggingRef.current).catch(() => {});
    }

    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = todos.findIndex((t) => t.id === active.id);
    const newIndex = todos.findIndex((t) => t.id === over.id);
    const moved = arrayMove(todos, oldIndex, newIndex);

    const reOrdered = moved.map((t, i) => ({
      ...t,
      order: i + 1,
      updatedAt: Date.now(),
      updatedBy: clientId,
    }));

    setTodos(reOrdered);
    saveToFirebase(reOrdered);
  }

  const total = todos.length;
  const completed = todos.filter((t) => t.done).length;
  const ids = useMemo(() => todos.map((t) => t.id), [todos]);

  return (
    <div className="app-root">
      <div className="app-card">
        <header className="app-header">
          <h1 className="app-title">ToDo list</h1>
          <div className="app-badges">
            <span className="badge">
              Total: <strong>{total}</strong>
            </span>
            <span className="badge badge--success">
              Completed: <strong>{completed}</strong>
            </span>
          </div>
        </header>

        <form
          className="add-form"
          onSubmit={(e) => {
            e.preventDefault();
            addTodo();
          }}
        >
          <input
            ref={inputRef}
            className="add-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="New task…"
          />
          <button type="submit" className="primary-button">
            Add
          </button>
        </form>

        <DndContext
          sensors={sensors}
          modifiers={[restrictToVerticalAxis]}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <ul className="todo-list">
              {todos.map((todo) => (
                <SortableTodoItem
                  key={todo.id}
                  todo={todo}
                  onToggle={toggleTodo}
                  onDelete={deleteTodo}
                  remoteDrag={remoteDrag}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}
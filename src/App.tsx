import './App.css';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';

import { database } from './firebase';
import { ref, onValue, set } from 'firebase/database';

type Todo = {
  id: string;
  text: string;
  done: boolean;
  order: number;
  updatedAt: number;
  updatedBy: string;
};

const clientId = (() => {
  const k = 'client_id';
  let id = localStorage.getItem(k);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(k, id);
  }
  return id;
})();

function SortableTodoItem({
  todo,
  onToggle,
  onDelete,
}: {
  todo: Todo;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: todo.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 5 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`todo-item ${todo.done ? 'todo-item--done' : ''}`}
    >
      <label className="todo-item__left">
        <input
          type="checkbox"
          className="todo-item__checkbox"
          checked={todo.done}
          onChange={() => onToggle(todo.id)}
        />
        <span className="todo-item__text">{todo.text}</span>
      </label>

      <div className="todo-item__actions">
        <button
          type="button"
          className="icon-button icon-button--danger"
          onClick={() => onDelete(todo.id)}
        >
          ✕
        </button>
        <span className="drag-handle" {...attributes} {...listeners}>
          ⠿
        </span>
      </div>
    </li>
  );
}

export default function App() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

  const todosRef = useRef(ref(database, 'todos')).current;
  useEffect(() => {
    const unsubscribe = onValue(todosRef, (snapshot) => {
      const val = snapshot.val();
      if (val) {
        const list = Object.values(val) as Todo[];
        setTodos(list.sort((a, b) => a.order - b.order));
      } else {
        setTodos([]);
      }
    });
    return () => unsubscribe();
  }, [todosRef]);

  const saveToFirebase = (newTodos: Todo[]) => {
    set(todosRef, newTodos);
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
    setText('');
    inputRef.current?.focus();
  }

  function toggleTodo(id: string) {
    const next = todos.map((t) =>
      t.id === id ? { ...t, done: !t.done, updatedAt: Date.now() } : t
    );
    setTodos(next);
    saveToFirebase(next);
  }

  function deleteTodo(id: string) {
    const next = todos.filter((t) => t.id !== id);
    setTodos(next);
    saveToFirebase(next);
  }
  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = todos.findIndex((t) => t.id === active.id);
    const newIndex = todos.findIndex((t) => t.id === over.id);
    const moved = arrayMove(todos, oldIndex, newIndex);
    const reOrdered = moved.map((t, i) => ({ ...t, order: i + 1 }));
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
          onDragEnd={onDragEnd}
          modifiers={[restrictToVerticalAxis]}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <ul className="todo-list">
              {todos.map((todo) => (
                <SortableTodoItem
                  key={todo.id}
                  todo={todo}
                  onToggle={toggleTodo}
                  onDelete={deleteTodo}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}

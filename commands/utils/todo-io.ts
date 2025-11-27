/**
 * Todo Management System - I/O Utilities
 * 
 * Functions for reading and writing todo files, change logs, and related data.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { Todo, TodoFile, ChangeLog, ChangeLogEntry, RollbackHistory, PreviousState } from './todo-types';

// ===================================================================
// FILE PATHS
// ===================================================================

export function getTodoDir(feature: string): string {
  return path.join('.cursor', 'project-manager', 'features', feature, 'todos');
}

export function getFeatureTodosPath(feature: string): string {
  return path.join(getTodoDir(feature), 'feature-todos.json');
}

export function getPhaseTodosPath(feature: string, phase: number): string {
  return path.join(getTodoDir(feature), `phase-${phase}-todos.json`);
}

export function getSessionTodosPath(feature: string, session: string): string {
  return path.join(getTodoDir(feature), `session-${session}-todos.json`);
}

export function getChangeLogPath(feature: string): string {
  return path.join(getTodoDir(feature), 'change-log.json');
}

export function getRollbackHistoryPath(feature: string): string {
  return path.join(getTodoDir(feature), 'rollback-history.json');
}

// ===================================================================
// TODO FILE OPERATIONS
// ===================================================================

export async function readTodoFile(filePath: string): Promise<TodoFile | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as TodoFile;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function writeTodoFile(filePath: string, todoFile: TodoFile): Promise<void> {
  // Ensure directory exists
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  
  // Write file with pretty formatting
  await fs.writeFile(filePath, JSON.stringify(todoFile, null, 2) + '\n', 'utf-8');
}

export async function findTodoById(feature: string, todoId: string): Promise<Todo | null> {
  // Determine tier from ID
  const tier = getTierFromId(todoId);
  
  let filePath: string;
  if (tier === 'feature') {
    filePath = getFeatureTodosPath(feature);
  } else if (tier === 'phase') {
    const phase = getPhaseFromId(todoId);
    filePath = getPhaseTodosPath(feature, phase);
  } else if (tier === 'session' || tier === 'task') {
    const session = getSessionFromId(todoId);
    filePath = getSessionTodosPath(feature, session);
  } else {
    return null;
  }
  
  const todoFile = await readTodoFile(filePath);
  if (!todoFile) {
    return null;
  }
  
  return todoFile.todos.find(t => t.id === todoId) || null;
}

export async function saveTodo(feature: string, todo: Todo): Promise<void> {
  // Determine tier and file path
  const tier = todo.tier;
  let filePath: string;
  
  if (tier === 'feature') {
    filePath = getFeatureTodosPath(feature);
  } else if (tier === 'phase') {
    const phase = getPhaseFromId(todo.id);
    filePath = getPhaseTodosPath(feature, phase);
  } else if (tier === 'session' || tier === 'task') {
    const session = getSessionFromId(todo.id);
    filePath = getSessionTodosPath(feature, session);
  } else {
    throw new Error(`Invalid tier: ${tier}`);
  }
  
  // Read existing file
  let todoFile = await readTodoFile(filePath);
  
  if (!todoFile) {
    // Create new file
    todoFile = {
      feature,
      todos: [],
      metadata: {
        version: '1.0',
        lastSynced: new Date().toISOString(),
      },
    };
    
    // Add phase/session info if applicable
    if (tier === 'phase') {
      todoFile.phase = getPhaseFromId(todo.id);
    } else if (tier === 'session' || tier === 'task') {
      todoFile.session = getSessionFromId(todo.id);
    }
  }
  
  // Update or add todo
  const index = todoFile.todos.findIndex(t => t.id === todo.id);
  if (index >= 0) {
    todoFile.todos[index] = todo;
  } else {
    todoFile.todos.push(todo);
  }
  
  // Update metadata
  todoFile.metadata.lastSynced = new Date().toISOString();
  
  // Write file
  await writeTodoFile(filePath, todoFile);
}

export async function getAllTodos(feature: string): Promise<Todo[]> {
  const todosDir = getTodoDir(feature);
  const allTodos: Todo[] = [];
  
  try {
    const files = await fs.readdir(todosDir);
    
    for (const file of files) {
      if (file.endsWith('-todos.json')) {
        const filePath = path.join(todosDir, file);
        const todoFile = await readTodoFile(filePath);
        if (todoFile) {
          allTodos.push(...todoFile.todos);
        }
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
  
  return allTodos;
}

// ===================================================================
// CHANGE LOG OPERATIONS
// ===================================================================

export async function readChangeLog(feature: string): Promise<ChangeLog | null> {
  const filePath = getChangeLogPath(feature);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as ChangeLog;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function writeChangeLog(feature: string, changeLog: ChangeLog): Promise<void> {
  const filePath = getChangeLogPath(feature);
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(changeLog, null, 2) + '\n', 'utf-8');
}

export async function addChangeLogEntry(feature: string, entry: ChangeLogEntry): Promise<void> {
  let changeLog = await readChangeLog(feature);
  
  if (!changeLog) {
    changeLog = {
      feature,
      version: '1.0',
      entries: [],
      metadata: {
        totalChanges: 0,
        lastUpdated: new Date().toISOString(),
      },
    };
  }
  
  changeLog.entries.push(entry);
  changeLog.metadata.totalChanges = changeLog.entries.length;
  changeLog.metadata.lastUpdated = new Date().toISOString();
  
  await writeChangeLog(feature, changeLog);
}

export async function getChangeLogEntry(feature: string, entryId: string): Promise<ChangeLogEntry | null> {
  const changeLog = await readChangeLog(feature);
  if (!changeLog) {
    return null;
  }
  
  return changeLog.entries.find(e => e.id === entryId) || null;
}

// ===================================================================
// ROLLBACK HISTORY OPERATIONS
// ===================================================================

export async function readRollbackHistory(feature: string): Promise<RollbackHistory | null> {
  const filePath = getRollbackHistoryPath(feature);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as RollbackHistory;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function writeRollbackHistory(feature: string, history: RollbackHistory): Promise<void> {
  const filePath = getRollbackHistoryPath(feature);
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(history, null, 2) + '\n', 'utf-8');
}

// ===================================================================
// HELPER FUNCTIONS
// ===================================================================

function getTierFromId(id: string): 'feature' | 'phase' | 'session' | 'task' {
  if (id.startsWith('feature-')) return 'feature';
  if (id.startsWith('phase-')) return 'phase';
  if (id.match(/^session-\d+\.\d+$/)) return 'session';
  if (id.match(/^session-\d+\.\d+-\d+$/)) return 'task';
  throw new Error(`Cannot determine tier from ID: ${id}`);
}

function getPhaseFromId(id: string): number {
  const match = id.match(/^phase-(\d+)/);
  if (!match) {
    throw new Error(`Cannot extract phase from ID: ${id}`);
  }
  return parseInt(match[1], 10);
}

function getSessionFromId(id: string): string {
  const match = id.match(/^session-(\d+\.\d+)/);
  if (!match) {
    throw new Error(`Cannot extract session from ID: ${id}`);
  }
  return match[1];
}


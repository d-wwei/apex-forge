export class ApexError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApexError";
  }
}

export class TaskNotFoundError extends ApexError {
  constructor(taskId: string) {
    super(`Task not found: ${taskId}`);
    this.name = "TaskNotFoundError";
  }
}

export class InvalidTransitionError extends ApexError {
  constructor(taskId: string, from: string, to: string) {
    super(`Invalid transition for ${taskId}: ${from} -> ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export class FactNotFoundError extends ApexError {
  constructor(factId: string) {
    super(`Fact not found: ${factId}`);
    this.name = "FactNotFoundError";
  }
}

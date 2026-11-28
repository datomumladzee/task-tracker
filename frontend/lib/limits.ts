// Text length limits, copied from the backend's request schemas so a field
// stops at the same length the server would accept. The backend still
// checks every request; these only keep people from typing past it.
//
// Sources: backend/app/tasks/schemas.py, projects/schemas.py,
// users/schemas.py and intake/schemas.py.

export const LIMITS = {
  taskTitle: 200,
  taskDescription: 5000,
  projectName: 200,
  projectDescription: 1000,
  comment: 5000,
  intakeText: 2000,
  email: 320,
  fullName: 255,
  password: 128,
  code: 6,
} as const;

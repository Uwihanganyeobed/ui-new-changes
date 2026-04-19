// ===== ENUMS =====
export enum RoleType {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  HOD = 'HOD',
  INSTRUCTOR = 'INSTRUCTOR',
  STUDENT = 'STUDENT',
}

export enum DayOfWeek {
  MONDAY = 'MONDAY',
  TUESDAY = 'TUESDAY',
  WEDNESDAY = 'WEDNESDAY',
  THURSDAY = 'THURSDAY',
  FRIDAY = 'FRIDAY',
  SATURDAY = 'SATURDAY',
  SUNDAY = 'SUNDAY',
}

export enum RoomType {
  LECTURE_HALL = 'LECTURE_HALL',
  LABORATORY = 'LABORATORY',
  COMPUTER_LAB = 'COMPUTER_LAB',
  TUTORIAL_ROOM = 'TUTORIAL_ROOM',
  SEMINAR_ROOM = 'SEMINAR_ROOM',
  CONFERENCE_ROOM = 'CONFERENCE_ROOM',
  WORKSHOP = 'WORKSHOP',
  AUDITORIUM = 'AUDITORIUM',
}

export enum CourseType {
  THEORY = 'THEORY',
  PRACTICAL = 'PRACTICAL',
  LAB = 'LAB',
  TUTORIAL = 'TUTORIAL',
  SEMINAR = 'SEMINAR',
  WORKSHOP = 'WORKSHOP',
  PROJECT = 'PROJECT',
}

export enum SemesterType {
  FALL = 'FALL',
  SPRING = 'SPRING',
  SUMMER = 'SUMMER',
}

export enum TimetableStatus {
  DRAFT = 'DRAFT',
  GENERATING = 'GENERATING',
  GENERATED = 'GENERATED',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
  FAILED = 'FAILED',
}

export enum SessionStatus {
  SCHEDULED = 'SCHEDULED',
  ONGOING = 'ONGOING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  RESCHEDULED = 'RESCHEDULED',
}

export enum ConstraintType {
  HARD = 'HARD',
  SOFT = 'SOFT',
}

export enum ConflictType {
  ROOM_CONFLICT = 'ROOM_CONFLICT',
  INSTRUCTOR_CONFLICT = 'INSTRUCTOR_CONFLICT',
  STUDENT_GROUP_CONFLICT = 'STUDENT_GROUP_CONFLICT',
  TIME_OVERLAP = 'TIME_OVERLAP',
  CAPACITY_EXCEEDED = 'CAPACITY_EXCEEDED',
  AVAILABILITY_VIOLATION = 'AVAILABILITY_VIOLATION',
  RESOURCE_UNAVAILABLE = 'RESOURCE_UNAVAILABLE',
}

export enum GenerationMethod {
  CSP = 'CSP',
  GENETIC = 'GENETIC',
  MANUAL = 'MANUAL',
  HYBRID = 'HYBRID',
}

export enum NotificationStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
  READ = 'READ',
}

export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  PUBLISH = 'PUBLISH',
  ARCHIVE = 'ARCHIVE',
  GENERATE = 'GENERATE',
  EXPORT = 'EXPORT',
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  INVITE_USER = 'INVITE_USER',
  INVITE_USERS_BULK = 'INVITE_USERS_BULK',
}

// ===== API COMMON TYPES =====
export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

// ===== USER & AUTHENTICATION =====
export interface User {
  id: string;
  email: string;
  username?: string | null;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  avatar?: string | null;
  isActive: boolean;
  isVerified: boolean;
  lastLoginAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  roles?: UserRole[];
  instructorProfile?: Instructor | null;
  studentProfile?: Student | null;
  notifications?: Notification[];
  auditLogs?: AuditLog[];
  createdDepartments?: Department[];
  createdCourses?: Course[];
  createdTimetables?: Timetable[];
  authSessions?: AuthSession[];
}

export interface TimetableAccess {
  departments: {
    create: boolean;
    view: boolean;
    update: boolean;
    delete: boolean;
    viewOwn: boolean;
  };
  courses: {
    create: boolean;
    view: boolean;
    update: boolean;
    delete: boolean;
    assign: boolean;
    viewOwn: boolean;
  };
  instructors: {
    create: boolean;
    view: boolean;
    update: boolean;
    delete: boolean;
    viewOwn: boolean;
    manageAvailability: boolean;
    assignCourses: boolean;
    assignRoomDepartment: boolean;
  };
  students: {
    create: boolean;
    view: boolean;
    update: boolean;
    delete: boolean;
    viewOwn: boolean;
    enroll: boolean;
  };
  rooms: {
    create: boolean;
    view: boolean;
    update: boolean;
    delete: boolean;
  };
  timeSlots: {
    create: boolean;
    view: boolean;
    update: boolean;
    delete: boolean;
  };
  timetables: {
    create: boolean;
    view: boolean;
    viewOwn: boolean;
    generate: boolean;
    publish: boolean;
    update: boolean;
    delete: boolean;
    export: boolean;
  };
  reports: {
    view: boolean;
    export: boolean;
    analytics: boolean;
  };
  settings: {
    view: boolean;
    update: boolean;
  };
  users: {
    create: boolean;
    view: boolean;
    update: boolean;
    delete: boolean;
    viewOwn: boolean;
  };
  semesters: {
    create: boolean;
    view: boolean;
    update: boolean;
    delete: boolean;
  };
  superAdminDashboard: {
    access: boolean;
  };
  adminDashboard: {
    access: boolean;
  };
  instructorDashboard: {
    access: boolean;
  };
  studentDashboard: {
    access: boolean;
  };
}

export interface AuthenticatedUser {
  id: string;
  username: string | null;
  email: string;
  firstName: string;
  lastName: string;
  role: RoleType;
  roles: RoleType[];
  hodFacultyId?: string | null;
  hodDepartmentId?: string | null;
  timetableAccess?: TimetableAccess;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  message: string;
  token: string;
  refreshToken: string;
  expiresIn: string;
  user: AuthenticatedUser;
}

export interface RegisterRequest {
  email: string;
  username?: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  roleType: RoleType;
}

export interface AuthSession {
  id: string;
  userId: string;
  sessionToken: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  isActive: boolean;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  user?: User;
}

export interface Role {
  id: string;
  name: RoleType;
  description?: string | null;
  permissions?: any; // JSON type
  createdAt: Date;
  updatedAt: Date;
  userRoles?: UserRole[];
}

export interface UserRole {
  id: string;
  userId: string;
  roleId: string;
  createdAt: Date;
  user?: User;
  role?: Role;
}

// ===== DEPARTMENT =====
export interface Department {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  headName?: string | null;
  email?: string | null;
  phone?: string | null;
  isActive: boolean;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: User;
  courses?: Course[];
  students?: Student[];
  timetables?: Timetable[];
  sessions?: TimetableSession[];
}

// ===== ACADEMIC YEAR & SEMESTER =====
export interface AcademicYear {
  id: string;
  year: string;
  startDate: Date;
  endDate: Date;
  isCurrent: boolean;
  createdAt: Date;
  updatedAt: Date;
  semesters?: Semester[];
}

export interface Semester {
  id: string;
  academicYearId: string;
  name: string;
  type: SemesterType;
  number: number;
  startDate: Date;
  endDate: Date;
  isCurrent: boolean;
  createdAt: Date;
  updatedAt: Date;
  academicYear?: AcademicYear;
  courses?: Course[];
  timetables?: Timetable[];
}

// ===== INSTRUCTOR =====
export interface Instructor {
  id: string;
  userId: string;
  employeeId: string;
  title?: string | null;
  designation?: string | null;
  department?: string | null;
  officeRoom?: string | null;
  maxWeeklyHours: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  user?: User;
  courses?: Course[];
  availability?: InstructorAvailability[];
  sessions?: TimetableSession[];
  preferences?: InstructorPreference[];
  unavailability?: InstructorUnavailability[];
}

export interface InstructorAvailability {
  id: string;
  instructorId: string;
  day: DayOfWeek;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
  instructor?: Instructor;
}

export interface InstructorUnavailability {
  id: string;
  instructorId: string;
  startDate: Date;
  endDate: Date;
  reason?: string | null;
  isRecurring: boolean;
  createdAt: Date;
  updatedAt: Date;
  instructor?: Instructor;
}

export interface InstructorPreference {
  id: string;
  instructorId: string;
  preferredDay?: DayOfWeek | null;
  avoidDay?: DayOfWeek | null;
  preferMorning: boolean;
  preferAfternoon: boolean;
  maxConsecutiveHours: number;
  minBreakMinutes: number;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
  instructor?: Instructor;
}


// ===== STUDENT =====
export interface Student {
  id: string;
  userId: string;
  studentId: string;
  departmentId: string;
  currentSemester: number;
  enrollmentYear: number;
  section?: string | null;
  batch?: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  user?: User;
  department?: Department;
  enrolledCourses?: CourseEnrollment[];
}


// ===== COURSE =====
export interface Course {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  credits: number;
  departmentId: string;
  semesterId: string;
  instructorId?: string | null;
  type: CourseType;
  weeklyHours: number;
  lectureHours: number;
  labHours: number;
  tutorialHours: number;
  requiresLab: boolean;
  requiresProjector: boolean;
  requiresComputer: boolean;
  maxStudents: number;
  minStudents: number;
  currentEnrollment: number;
  isElective: boolean;
  isActive: boolean;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  department?: Department;
  semester?: Semester;
  instructor?: Instructor | null;
  createdBy?: User;
  sessions?: TimetableSession[];
  enrollments?: CourseEnrollment[];
  prerequisites?: CoursePrerequisite[];
  prerequisiteFor?: CoursePrerequisite[];
}

export interface CourseEnrollment {
  id: string;
  studentId: string;
  courseId: string;
  enrolledAt: Date;
  droppedAt?: Date | null;
  grade?: string | null;
  isActive: boolean;
  student?: Student;
  course?: Course;
}


export interface CoursePrerequisite {
  id: string;
  courseId: string;
  prerequisiteId: string;
  createdAt: Date;
  course?: Course;
  prerequisite?: Course;
}


// ===== ROOM =====
export interface Room {
  id: string;
  number: string;
  name?: string | null;
  building: string;
  floor?: number | null;
  capacity: number;
  type: RoomType;
  hasProjector: boolean;
  hasComputers: boolean;
  hasWhiteboard: boolean;
  hasAC: boolean;
  hasWifi: boolean;
  computerCount?: number | null;
  isActive: boolean;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
  sessions?: TimetableSession[];
  unavailability?: RoomUnavailability[];
}

export interface RoomUnavailability {
  id: string;
  roomId: string;
  startDate: Date;
  endDate: Date;
  reason?: string | null;
  createdAt: Date;
  updatedAt: Date;
  room?: Room;
}

// ===== TIME SLOT =====
export interface TimeSlot {
  id: string;
  day: DayOfWeek;
  startTime: string;
  endTime: string;
  slotNumber: number;
  duration: number;
  isBreak: boolean;
  breakAfter: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  sessions?: TimetableSession[];
}

// ===== TIMETABLE =====
export interface Timetable {
  id: string;
  name: string;
  description?: string | null;
  departmentId: string;
  semesterId: string;
  weekNumber: number;
  status: TimetableStatus;
  generationMethod: GenerationMethod;
  publishedAt?: Date | null;
  validFrom: Date;
  validTo: Date;
  conflictCount: number;
  totalSessions: number;
  generationTime?: number | null;
  isActive: boolean;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  department?: Department;
  semester?: Semester;
  createdBy?: User;
  sessions?: TimetableSession[];
  conflicts?: Conflict[];
  generationLogs?: GenerationLog[];
}

export interface TimetableSession {
  id: string;
  timetableId: string;
  courseId: string;
  instructorId: string;
  roomId: string;
  timeSlotId: string;
  departmentId: string;
  weekNumber: number;
  sessionType: CourseType;
  status: SessionStatus;
  notes?: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  timetable?: Timetable;
  course?: Course;
  instructor?: Instructor;
  room?: Room;
  timeSlot?: TimeSlot;
  department?: Department;
}

export interface Conflict {
  id: string;
  timetableId: string;
  type: ConflictType;
  severity: number;
  description: string;
  affectedSessions: any; // JSON type
  isResolved: boolean;
  resolvedAt?: Date | null;
  resolvedBy?: string | null;
  resolutionNotes?: string | null;
  createdAt: Date;
  updatedAt: Date;
  timetable?: Timetable;
}

export interface GenerationLog {
  id: string;
  timetableId: string;
  method: GenerationMethod;
  status: TimetableStatus;
  startTime: Date;
  endTime?: Date | null;
  duration?: number | null;
  coursesProcessed: number;
  sessionsGenerated: number;
  conflictsFound: number;
  errorMessage?: string | null;
  logs?: any; // JSON type
  createdAt: Date;
  timetable?: Timetable;
}

// ===== CONSTRAINT =====
export interface Constraint {
  id: string;
  name: string;
  description?: string | null;
  type: ConstraintType;
  priority: number;
  isActive: boolean;
  rules: any; // JSON type
  createdAt: Date;
  updatedAt: Date;
}

// ===== NOTIFICATION =====
export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  status: NotificationStatus;
  readAt?: Date | null;
  data?: any; // JSON type
  createdAt: Date;
  updatedAt: Date;
  user?: User;
}

// ===== AUDIT LOG =====
export interface AuditLog {
  id: string;
  userId: string;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  changes?: any; // JSON type
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: Date;
  user?: User;
}

// ===== SYSTEM SETTINGS =====
export interface SystemSettings {
  id: string;
  key: string;
  value: string;
  description?: string | null;
  dataType: string;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ===== FILTER TYPES =====
export interface UserFilters extends PaginationParams {
  roleType?: RoleType;
  isActive?: boolean;
  isVerified?: boolean;
}

export interface CourseFilters extends PaginationParams {
  departmentId?: string;
  semesterId?: string;
  instructorId?: string;
  type?: CourseType;
  isActive?: boolean;
  isElective?: boolean;
}

export interface TimetableFilters extends PaginationParams {
  departmentId?: string;
  semesterId?: string;
  status?: TimetableStatus;
  isActive?: boolean;
}

export interface RoomFilters extends PaginationParams {
  type?: RoomType;
  building?: string;
  isActive?: boolean;
  hasProjector?: boolean;
  hasComputers?: boolean;
}

// ===== REQUEST/RESPONSE TYPES =====
export interface CreateDepartmentRequest {
  code: string;
  name: string;
  description?: string;
  building?: string;
  headName?: string;
  email?: string;
  phone?: string;
}

export interface UpdateDepartmentRequest extends Partial<CreateDepartmentRequest> {
  isActive?: boolean;
}

export interface CreateCourseRequest {
  code: string;
  name: string;
  description?: string;
  credits: number;
  departmentId: string;
  semesterId: string;
  instructorId?: string;
  type: CourseType;
  weeklyHours: number;
  lectureHours?: number;
  labHours?: number;
  tutorialHours?: number;
  requiresLab?: boolean;
  requiresProjector?: boolean;
  requiresComputer?: boolean;
  maxStudents: number;
  minStudents?: number;
  isElective?: boolean;
}

export interface UpdateCourseRequest extends Partial<CreateCourseRequest> {
  isActive?: boolean;
}

export interface CreateTimetableRequest {
  name: string;
  description?: string;
  departmentId: string;
  semesterId: string;
  weekNumber?: number;
  generationMethod: GenerationMethod;
  validFrom: Date;
  validTo: Date;
}

export interface GenerateTimetableRequest {
  timetableId: string;
  method: GenerationMethod;
  constraints?: {
    maxConsecutiveHours?: number;
    minBreakMinutes?: number;
    respectInstructorPreferences?: boolean;
    avoidBackToBack?: boolean;
  };
}

export interface CreateRoomRequest {
  number: string;
  name?: string;
  building: string;
  floor?: number;
  capacity: number;
  type: RoomType;
  hasProjector?: boolean;
  hasComputers?: boolean;
  hasWhiteboard?: boolean;
  hasAC?: boolean;
  hasWifi?: boolean;
  computerCount?: number;
  notes?: string;
}

export interface UpdateRoomRequest extends Partial<CreateRoomRequest> {
  isActive?: boolean;
}

export interface CreateInstructorRequest {
  userId: string;
  employeeId: string;
  title?: string;
  designation?: string;
  department?: string;
  officeRoom?: string;
  maxWeeklyHours?: number;
}

export interface UpdateInstructorRequest extends Partial<CreateInstructorRequest> {
  isActive?: boolean;
}

export interface CreateStudentRequest {
  userId: string;
  studentId: string;
  departmentId: string;
  currentSemester: number;
  enrollmentYear: number;
  section?: string;
  batch?: string;
}

export interface UpdateStudentRequest extends Partial<CreateStudentRequest> {
  isActive?: boolean;
}

// ===== API RESPONSE TYPES =====
export interface DepartmentsResponse extends PaginatedResponse<Department> {}
export interface CoursesResponse extends PaginatedResponse<Course> {}
export interface TimetablesResponse extends PaginatedResponse<Timetable> {}
export interface RoomsResponse extends PaginatedResponse<Room> {}
export interface InstructorsResponse extends PaginatedResponse<Instructor> {}
export interface StudentsResponse extends PaginatedResponse<Student> {}
export interface UsersResponse extends PaginatedResponse<User> {}

export interface SingleDepartmentResponse extends ApiResponse<Department> {}
export interface SingleCourseResponse extends ApiResponse<Course> {}
export interface SingleTimetableResponse extends ApiResponse<Timetable> {}
export interface SingleRoomResponse extends ApiResponse<Room> {}
export interface SingleInstructorResponse extends ApiResponse<Instructor> {}
// export interface SingleStudentResponse extends ApiResponse<Student> {}
export interface SingleUserResponse extends ApiResponse<User> {}

// ===== VALIDATION TYPES =====
export interface TimetableValidationResult {
  valid: boolean;
  conflicts: Array<{
    type: ConflictType;
    description: string;
    severity: 'ERROR' | 'WARNING';
    affectedSessions: string[];
  }>;
}

export interface ConflictResolution {
  conflictId: string;
  resolution: 'REASSIGN_ROOM' | 'CHANGE_TIME' | 'SPLIT_SESSION' | 'MANUAL';
  newRoomId?: string;
  newTimeSlotId?: string;
  notes?: string;
}

// ===== UI COMPONENT TYPES =====
export interface NoPermissionUIProps {
  resource?: string;
  onGoBack?: () => void;
  onGoHome?: () => void;
  onContactSupport?: () => void;
  showRefresh?: boolean;
}

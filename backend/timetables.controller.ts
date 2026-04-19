import type { Response } from 'express';
import prisma from '../config/prisma.js';
import type { AuthenticatedRequest } from '../types/access.js';
import { z } from 'zod';
import { TimetableGenerator } from '../utils/timetable-generator.js';
import { generateTimetablePDF } from '../utils/pdfGenerator.js';

// Validation schemas
const createTimetableSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  departmentId: z.string().cuid(),
  semesterId: z.string().cuid(),
  weekNumber: z.number().int().min(1).max(52).default(1),
  validFrom: z.string().datetime(),
  validTo: z.string().datetime(),
  generationMethod: z.enum(['CSP', 'GENETIC', 'MANUAL', 'HYBRID']).default('CSP'),
});

const updateTimetableSchema = createTimetableSchema.partial();

const generateTimetableSchema = z.object({
  departmentId: z
    .union([
      z.string().cuid(),
      z.literal(''),
      z.undefined(),
    ])
    .optional()
    .transform((val) => (val === '' ? undefined : val)),
  facultyId: z
    .union([
      z.string().cuid(),
      z.literal(''),
      z.undefined(),
    ])
    .optional()
    .transform((val) => (val === '' ? undefined : val)),
  semesterId: z
    .union([
      z.string().cuid(),
      z.literal(''),
      z.undefined(),
    ])
    .optional()
    .transform((val) => (val === '' ? undefined : val)),
  weekNumber: z.number().int().min(1).max(52).default(1),
  validFrom: z.string().optional(),
  validTo: z.string().optional(),
  method: z.enum(['CSP', 'GENETIC', 'MANUAL', 'HYBRID']).default('GENETIC'),
  constraints: z.object({
    maxInstructorHours: z.number().int().min(1).max(40).optional(),
    preferMorningSlots: z.boolean().optional(),
    avoidBackToBack: z.boolean().optional(),
  }).optional(),
  programTypes: z.array(z.enum(['DAY', 'EVENING', 'WEEKEND'])).optional(),
  timetableType: z.enum(['DAY', 'EVENING', 'WEEKEND']).optional(),
});

/**
 * Get all timetables
 */
export const getTimetables = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { page = '1', limit = '50', search, facultyId, departmentId, semesterId, status, isActive } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};

    // Role-based isolation logic
    if (req.user.role === 'SUPER_ADMIN') {
      // Super Admin sees everything
      if (departmentId) where.departmentId = departmentId as string;
      if (facultyId) where.department = { facultyId: facultyId as string };
    } else if (req.user.role === 'HOD' && req.user.hodFacultyId) {
      // HOD sees everything in their Faculty
      where.department = { facultyId: req.user.hodFacultyId };
      if (departmentId) {
        where.departmentId = departmentId as string;
      }
    } else if (req.user.role === 'ADMIN' && req.user.hodDepartmentId) {
      // Dept Admin still scoped to their department
      where.departmentId = req.user.hodDepartmentId;
    } else {
      // Other roles (Instructor/Student) or users without room/dept assigned
      if (departmentId) {
        where.departmentId = departmentId as string;
      } else if (req.user.hodDepartmentId) {
        where.departmentId = req.user.hodDepartmentId;
      }
    }

    if (search) {
      const searchCondition = {
        OR: [
          { name: { contains: search as string, mode: 'insensitive' } },
          { description: { contains: search as string, mode: 'insensitive' } },
        ],
      };

      if (where.OR) {
        // If we already have an OR for isolation, move both to an AND to combine them
        const isolationOR = where.OR;
        delete where.OR;
        where.AND = [
          { OR: isolationOR },
          searchCondition
        ];
      } else if (where.AND) {
        where.AND.push(searchCondition);
      } else {
        where.OR = searchCondition.OR;
      }
    }

    if (semesterId) {
      where.semesterId = semesterId as string;
    }

    if (status) {
      where.status = status as any;
    }

    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    const [timetables, total] = await Promise.all([
      prisma.timetable.findMany({
        where,
        skip,
        take: limitNum,
        include: {
          department: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
          semester: {
            select: {
              id: true,
              name: true,
              type: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          _count: {
            select: {
              sessions: true,
              conflicts: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
      prisma.timetable.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      message: 'Timetables retrieved successfully',
      data: timetables,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Error fetching timetables:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch timetables',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Get single timetable
 */
export const getTimetable = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { includeSessions = 'true' } = req.query;

    const timetable = await prisma.timetable.findUnique({
      where: { id },
      include: {
        department: {
          select: {
            id: true,
            code: true,
            name: true,
            description: true,
          },
        },
        semester: {
          select: {
            id: true,
            name: true,
            type: true,
            startDate: true,
            endDate: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        sessions: includeSessions === 'true' ? {
          include: {
            course: {
              select: {
                id: true,
                code: true,
                name: true,
                credits: true,
                type: true,
                level: true,
                levelClass: true,
              },
            },
            instructor: {
              include: {
                user: {
                  select: {
                    firstName: true,
                    lastName: true,
                    email: true,
                  },
                },
              },
            },
            room: {
              select: {
                id: true,
                number: true,
                name: true,
                building: true,
                capacity: true,
                type: true,
              },
            },
            timeSlot: {
              select: {
                id: true,
                day: true,
                startTime: true,
                endTime: true,
              },
            },
          },
          orderBy: [
            { weekNumber: 'asc' },
            { timeSlot: { day: 'asc' } },
            { timeSlot: { startTime: 'asc' } },
          ],
        } : false,
        conflicts: true,
        _count: {
          select: {
            sessions: true,
            conflicts: true,
          },
        },
      },
    });

    if (!timetable) {
      return res.status(404).json({
        success: false,
        message: 'Timetable not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Timetable retrieved successfully',
      data: timetable,
    });
  } catch (error) {
    console.error('Error fetching timetable:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch timetable',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Get school-wide timetable organized by departments
 * Returns timetable with all departments in a grid format
 */
export const getSchoolWideTimetable = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate, semesterId, status, timetableId } = req.query;

    // If timetableId is provided, get that specific timetable
    let timetableWhere: any = {};
    if (timetableId) {
      timetableWhere.id = timetableId as string;
    } else {
      // Otherwise, get by semester and status
      if (semesterId) {
        timetableWhere.semesterId = semesterId as string;
      }

      if (status) {
        timetableWhere.status = status as any;
      } else {
        // Default to published timetables
        timetableWhere.status = 'PUBLISHED' as any;
      }

      if (startDate) {
        timetableWhere.validFrom = new Date(startDate as string);
      }
      if (endDate) {
        timetableWhere.validTo = new Date(endDate as string);
      }
    }

    // Get all timetables (could be multiple if school-wide or single department)
    const timetables = await prisma.timetable.findMany({
      where: timetableWhere,
      include: {
        department: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        semester: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
        sessions: {
          include: {
            course: {
              select: {
                id: true,
                code: true,
                name: true,
                credits: true,
                type: true,
                level: true,
                levelClass: true,
              },
            },
            instructor: {
              include: {
                user: {
                  select: {
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
            room: {
              select: {
                id: true,
                number: true,
                name: true,
                building: true,
                capacity: true,
              },
            },
            timeSlot: {
              select: {
                id: true,
                day: true,
                startTime: true,
                endTime: true,
                slotNumber: true,
              },
            },
            department: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
          },
          orderBy: [
            { timeSlot: { day: 'asc' } },
            { timeSlot: { slotNumber: 'asc' } },
            { timeSlot: { startTime: 'asc' } },
          ],
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // If no timetables found, return empty
    if (timetables.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No timetables found',
        data: {
          timetable: null,
          departments: [],
          sessionsByDepartment: {},
          timeSlots: [],
        },
      });
    }

    // Get all unique departments from sessions
    const departmentMap = new Map<string, any>();
    const allSessions: any[] = [];

    timetables.forEach(timetable => {
      timetable.sessions.forEach((session: any) => {
        allSessions.push(session);
        const deptId = session.departmentId || timetable.departmentId;
        if (deptId && !departmentMap.has(deptId)) {
          departmentMap.set(deptId, session.department || timetable.department);
        }
      });
    });

    // Get all active time slots from database (to include breaks, lunch, etc.)
    const allTimeSlots = await prisma.timeSlot.findMany({
      where: {
        isActive: true,
      },
      orderBy: [
        { day: 'asc' },
        { slotNumber: 'asc' },
        { startTime: 'asc' },
      ],
    });

    // Create a map of time slots by key for quick lookup
    const timeSlotMap = new Map<string, any>();
    allTimeSlots.forEach(slot => {
      const key = `${slot.day}-${slot.startTime}-${slot.endTime}`;
      if (!timeSlotMap.has(key)) {
        timeSlotMap.set(key, slot);
      }
    });

    // Also add any time slots from sessions that might not be in the main list
    allSessions.forEach(session => {
      if (session.timeSlot) {
        const key = `${session.timeSlot.day}-${session.timeSlot.startTime}-${session.timeSlot.endTime}`;
        if (!timeSlotMap.has(key)) {
          timeSlotMap.set(key, session.timeSlot);
        }
      }
    });

    // Sort time slots by day and time
    const timeSlots = Array.from(timeSlotMap.values()).sort((a, b) => {
      const dayOrder: Record<string, number> = {
        MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6, SUNDAY: 7,
      };
      const dayDiff = (dayOrder[a.day] || 99) - (dayOrder[b.day] || 99);
      if (dayDiff !== 0) return dayDiff;
      // Use slotNumber if available, otherwise use startTime
      if (a.slotNumber && b.slotNumber) {
        return a.slotNumber - b.slotNumber;
      }
      return a.startTime.localeCompare(b.startTime);
    });

    // Group sessions by department and time slot
    const sessionsByDepartment: Record<string, Record<string, any[]>> = {};

    Array.from(departmentMap.keys()).forEach(deptId => {
      sessionsByDepartment[deptId] = {};
      // Initialize all time slots for this department
      timeSlots.forEach(slot => {
        const key = `${slot.day}-${slot.startTime}-${slot.endTime}`;
        sessionsByDepartment[deptId][key] = [];
      });
    });

    // Populate sessions into the grid
    allSessions.forEach(session => {
      const deptId = session.departmentId || timetables[0]?.departmentId;
      if (deptId && session.timeSlot) {
        const key = `${session.timeSlot.day}-${session.timeSlot.startTime}-${session.timeSlot.endTime}`;
        if (sessionsByDepartment[deptId] && sessionsByDepartment[deptId][key]) {
          sessionsByDepartment[deptId][key].push(session);
        }
      }
    });

    // Get primary timetable (first one or the one with most sessions)
    const primaryTimetable = timetables.reduce((prev, curr) =>
      (curr.sessions?.length || 0) > (prev.sessions?.length || 0) ? curr : prev
    );

    res.status(200).json({
      success: true,
      message: 'School-wide timetable retrieved successfully',
      data: {
        timetable: {
          id: primaryTimetable.id,
          name: primaryTimetable.name,
          semester: primaryTimetable.semester,
          validFrom: primaryTimetable.validFrom,
          validTo: primaryTimetable.validTo,
        },
        departments: Array.from(departmentMap.values()),
        sessionsByDepartment,
        timeSlots,
      },
    });
  } catch (error) {
    console.error('Error fetching school-wide timetable:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch school-wide timetable',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Get department timetable
 */
export const getDepartmentTimetable = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { deptId } = req.params;
    const { startDate, endDate, semesterId, status } = req.query;

    const where: any = {
      departmentId: deptId,
    };

    if (semesterId) {
      where.semesterId = semesterId as string;
    }

    if (status) {
      where.status = status as any;
    } else {
      // Default to published timetables
      where.status = 'PUBLISHED' as any;
    }

    if (startDate) {
      where.validFrom = { gte: new Date(startDate as string) };
    }
    if (endDate) {
      where.validTo = { lte: new Date(endDate as string) };
    }

    const timetables = await prisma.timetable.findMany({
      where,
      include: {
        semester: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
        sessions: {
          include: {
            course: {
              select: {
                id: true,
                code: true,
                name: true,
                credits: true,
                type: true,
                level: true,
                levelClass: true,
              },
            },
            instructor: {
              include: {
                user: {
                  select: {
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
            room: {
              select: {
                id: true,
                number: true,
                name: true,
                building: true,
                capacity: true,
              },
            },
            timeSlot: {
              select: {
                id: true,
                day: true,
                startTime: true,
                endTime: true,
              },
            },
          },
          orderBy: [
            { timeSlot: { day: 'asc' } },
            { timeSlot: { startTime: 'asc' } },
          ],
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.status(200).json({
      success: true,
      message: 'Department timetable retrieved successfully',
      data: timetables,
    });
  } catch (error) {
    console.error('Error fetching department timetable:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch department timetable',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Get instructor timetable
 */
export const getInstructorTimetable = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { startDate, endDate, semesterId } = req.query;

    // Find instructor
    const instructor = await prisma.instructor.findUnique({
      where: { id },
    });

    if (!instructor) {
      return res.status(404).json({
        success: false,
        message: 'Instructor not found',
      });
    }

    const timetableWhere: any = {
      ...(semesterId ? { semesterId: semesterId as string } : {}),
    };

    if (startDate) {
      timetableWhere.validFrom = { gte: new Date(startDate as string) };
    }
    if (endDate) {
      timetableWhere.validTo = { lte: new Date(endDate as string) };
    }

    // Get sessions through timetables
    const sessions = await prisma.timetableSession.findMany({
      where: {
        instructorId: id,
        isActive: true,
        timetable: timetableWhere,
      },
      include: {
        timetable: {
          include: {
            semester: {
              select: {
                id: true,
                name: true,
                type: true,
              },
            },
            department: {
              select: {
                code: true,
                name: true,
              },
            },
          },
        },
        course: {
          select: {
            id: true,
            code: true,
            name: true,
            credits: true,
            type: true,
            level: true,
            levelClass: true,
          },
        },
        room: {
          select: {
            id: true,
            number: true,
            name: true,
            building: true,
          },
        },
        timeSlot: {
          select: {
            id: true,
            day: true,
            startTime: true,
            endTime: true,
          },
        },
      },
      orderBy: [
        { weekNumber: 'asc' },
        { timeSlot: { day: 'asc' } },
        { timeSlot: { startTime: 'asc' } },
      ],
    });

    res.status(200).json({
      success: true,
      message: 'Instructor timetable retrieved successfully',
      data: {
        instructor: {
          id: instructor.id,
          employeeId: instructor.employeeId,
          user: instructor.userId ? await prisma.user.findUnique({
            where: { id: instructor.userId },
            select: {
              firstName: true,
              lastName: true,
              email: true,
            },
          }) : null,
        },
        sessions,
      },
    });
  } catch (error) {
    console.error('Error fetching instructor timetable:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch instructor timetable',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Get student timetable
 */
export const getStudentTimetable = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { startDate, endDate, semesterId } = req.query;

    // Find student
    const student = await prisma.student.findUnique({
      where: { id },
      include: {
        enrolledCourses: {
          where: {
            isActive: true,
          },
          include: {
            course: true,
          },
        },
      },
    });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found',
      });
    }

    // Get course IDs
    const courseIds = student.enrolledCourses.map((e: any) => e.courseId);

    if (courseIds.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'Student has no enrolled courses',
        data: {
          student: {
            id: student.id,
            studentId: student.studentId,
          },
          sessions: [],
        },
      });
    }

    const timetableWhere: any = {
      status: 'PUBLISHED',
      ...(semesterId ? { semesterId: semesterId as string } : {}),
    };

    if (startDate) {
      timetableWhere.validFrom = { gte: new Date(startDate as string) };
    }
    if (endDate) {
      timetableWhere.validTo = { lte: new Date(endDate as string) };
    }

    // Get sessions for enrolled courses
    const sessions = await prisma.timetableSession.findMany({
      where: {
        courseId: { in: courseIds },
        isActive: true,
        timetable: timetableWhere,
      },
      include: {
        timetable: {
          include: {
            semester: {
              select: {
                id: true,
                name: true,
                type: true,
              },
            },
            department: {
              select: {
                code: true,
                name: true,
              },
            },
          },
        },
        course: {
          select: {
            id: true,
            code: true,
            name: true,
            credits: true,
            type: true,
            level: true,
            levelClass: true,
          },
        },
        instructor: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        room: {
          select: {
            id: true,
            number: true,
            name: true,
            building: true,
          },
        },
        timeSlot: {
          select: {
            id: true,
            day: true,
            startTime: true,
            endTime: true,
          },
        },
      },
      orderBy: [
        { weekNumber: 'asc' },
        { timeSlot: { day: 'asc' } },
        { timeSlot: { startTime: 'asc' } },
      ],
    });

    res.status(200).json({
      success: true,
      message: 'Student timetable retrieved successfully',
      data: {
        student: {
          id: student.id,
          studentId: student.studentId,
        },
        sessions,
      },
    });
  } catch (error) {
    console.error('Error fetching student timetable:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch student timetable',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Generate timetable for whole school or specific department
 * If departmentId is not provided, generates for all departments
 */
export const generateTimetable = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validatedData = generateTimetableSchema.parse(req.body);

    // For whole-school timetable, use current semester if not specified
    let semester = null;
    if (validatedData.semesterId) {
      semester = await prisma.semester.findUnique({
        where: { id: validatedData.semesterId },
      });

      if (!semester) {
        return res.status(404).json({
          success: false,
          message: 'Semester not found',
        });
      }
    } else {
      // Get current/active semester
      semester = await prisma.semester.findFirst({
        where: { isCurrent: true },
      });

      if (!semester) {
        return res.status(404).json({
          success: false,
          message: 'No current semester found',
        });
      }
    }

    // Get courses - for whole school (all departments) or specific department
    // IMPORTANT: For whole school timetable, fetch ALL courses from ALL departments
    const courseWhere: any = {
      semesterId: semester.id,
      isActive: true,
    };

    if (validatedData.departmentId) {
      courseWhere.departmentId = validatedData.departmentId;
    } else if (validatedData.facultyId) {
      courseWhere.department = { facultyId: validatedData.facultyId };
    } else if (req.user.role === 'HOD' && req.user.hodFacultyId) {
      // Restriction: HODs can only generate timetables for their own faculty
      courseWhere.department = { facultyId: req.user.hodFacultyId };
    } else if (req.user.role === 'ADMIN' && req.user.hodDepartmentId) {
      // Restriction: Dept Admins can only generate for their own department
      courseWhere.departmentId = req.user.hodDepartmentId;
    } else if (req.user.role !== 'SUPER_ADMIN') {
      // Other roles should be restricted to their assigned department by default
      if (req.user.hodDepartmentId) {
        courseWhere.departmentId = req.user.hodDepartmentId;
      }
    }

    if (validatedData.programTypes && validatedData.programTypes.length > 0) {
      courseWhere.programType = { in: validatedData.programTypes };
    }

    // Double-check HOD scope for peace of mind
    if (req.user.role === 'HOD' && req.user.hodFacultyId) {
      // If an HOD tries to generate for another faculty via API, stop them
      if (validatedData.facultyId && validatedData.facultyId !== req.user.hodFacultyId) {
        return res.status(403).json({ success: false, message: 'You can only generate for your own faculty' });
      }
      courseWhere.department = { facultyId: req.user.hodFacultyId };
    }

    const courses = await prisma.course.findMany({
      where: courseWhere,
      include: {
        instructor: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        department: true,
        prerequisites: {
          include: {
            prerequisite: true
          }
        }
      },
    });

    if (courses.length === 0) {
      return res.status(400).json({
        success: false,
        message: validatedData.departmentId
          ? 'No active courses found for this department and semester'
          : 'No active courses found for this semester',
      });
    }

    // Ensure ALL courses have required fields
    const validCourses = courses.filter(course => {
      if (!course.instructorId) {
        console.warn(`Course ${course.code} has no instructor assigned`);
        return false;
      }
      return true;
    });

    if (validCourses.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No courses with assigned instructors found',
      });
    }

    // Get available rooms
    const rooms = await prisma.room.findMany({
      where: {
        isActive: true,
      },
    });

    if (rooms.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No active rooms available',
      });
    }

    // Get available timeslots
    const timeSlotWhere: any = {
      isActive: true,
    };

    if (validatedData.programTypes && validatedData.programTypes.length > 0) {
      timeSlotWhere.OR = [
        { programType: { in: validatedData.programTypes } },
        { programType: null }, // Slots with no program type are general
      ];
    }

    const timeSlots = await prisma.timeSlot.findMany({
      where: timeSlotWhere,
    });

    if (timeSlots.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No active time slots available',
      });
    }

    // For school-wide timetable, we need to create one timetable per department or a single school-wide one
    // For now, let's create a single timetable and handle departmentId in sessions
    // First, get all departments from courses
    const departments = await prisma.department.findMany({
      where: {
        id: { in: [...new Set(courses.map(c => c.departmentId))] },
      },
    });

    // Create timetable record
    // For school-wide, use first department as placeholder (or create a special "ALL" department)
    // Actually, let's use the first department's ID as a placeholder for school-wide timetables
    const primaryDepartmentId = validatedData.departmentId || departments[0]?.id;

    const dateLabel = (validatedData.validFrom && validatedData.validTo)
      ? `${new Date(validatedData.validFrom).toLocaleDateString()} - ${new Date(validatedData.validTo).toLocaleDateString()}`
      : `Week ${validatedData.weekNumber}`;

    let scopeName = 'School-Wide';
    if (validatedData.departmentId) {
      scopeName = courses[0]?.department?.name || 'Department';
    } else if (req.user.role === 'HOD' && req.user.hodFacultyId) {
      // Try to find the faculty name
      const faculty = await prisma.faculty.findUnique({
        where: { id: req.user.hodFacultyId },
        select: { name: true }
      });
      scopeName = faculty ? `Faculty of ${faculty.name}` : 'Faculty-Wide';
    }

    const timetableName = `${scopeName} ${validatedData.timetableType || ''} Timetable - ${semester.name} - ${dateLabel}`;

    const timetableDescription = validatedData.departmentId
      ? `Auto-generated timetable for ${courses[0]?.department?.name || 'Department'}`
      : `Auto-generated ${validatedData.timetableType || ''} timetable for all departments`;

    const timetableData: any = {
      name: timetableName,
      description: timetableDescription,
      semesterId: semester.id,
      weekNumber: validatedData.weekNumber,
      status: 'GENERATING',
      generationMethod: validatedData.method,
      validFrom: validatedData.validFrom ? new Date(validatedData.validFrom) : semester.startDate,
      validTo: validatedData.validTo ? new Date(validatedData.validTo) : semester.endDate,
      createdById: req.user!.id,
      departmentId: primaryDepartmentId, // Required by schema, but sessions will have their own departmentId
    };

    const timetable = await prisma.timetable.create({
      data: timetableData,
      include: {
        department: {
          select: {
            code: true,
            name: true,
          },
        },
        semester: {
          select: {
            name: true,
            type: true,
          },
        },
      },
    });

    // Get instructor availability
    const instructorAvailabilityMap = new Map<string, any[]>();
    for (const course of validCourses) {
      if (course.instructorId && !instructorAvailabilityMap.has(course.instructorId)) {
        const availability = await prisma.instructorAvailability.findMany({
          where: {
            instructorId: course.instructorId,
            isAvailable: true,
          },
        });
        instructorAvailabilityMap.set(course.instructorId, availability);
        console.log(`Instructor ${course.instructorId} has ${availability.length} availability records`);
      }
    }

    console.log(`Instructor availability map size: ${instructorAvailabilityMap.size}`);

    // Log generation start
    const generationLog = await prisma.generationLog.create({
      data: {
        timetableId: timetable.id,
        method: validatedData.method,
        status: 'GENERATING' as any,
        startTime: new Date(),
        coursesProcessed: 0,
        sessionsGenerated: 0,
        conflictsFound: 0,
        logs: {
          coursesCount: validCourses.length,
          totalCoursesFound: courses.length,
          roomsCount: rooms.length,
          timeSlotsCount: timeSlots.length,
          constraints: validatedData.constraints,
          message: validatedData.departmentId
            ? 'Timetable generation started for department'
            : 'Whole school timetable generation started',
        },
      },
    });

    try {
      // Validate we have required data
      if (validCourses.length === 0) {
        throw new Error('No valid courses found with assigned instructors');
      }
      if (rooms.length === 0) {
        throw new Error('No active rooms available');
      }
      if (timeSlots.length === 0) {
        throw new Error('No active time slots available');
      }

      // Initialize generator with valid courses (all courses with instructors)
      const generator = new TimetableGenerator(
        validCourses, // Use validCourses instead of courses
        rooms,
        timeSlots,
        instructorAvailabilityMap,
        validatedData.constraints || {}
      );

      // Generate timetable sessions
      console.log(`Generating timetable with ${validCourses.length} courses, ${rooms.length} rooms, ${timeSlots.length} time slots`);
      const sessions = await generator.generate(validatedData.weekNumber);
      const stats = generator.getStatistics();

      console.log(`Generated ${sessions.length} sessions. Statistics:`, stats);

      // Create timetable sessions in database
      let sessionsCreated = 0;
      let conflictsFound = 0;

      // Group sessions by course to handle multiple sessions per course
      const sessionsByCourse = new Map<string, any[]>();
      sessions.forEach(session => {
        if (!sessionsByCourse.has(session.courseId)) {
          sessionsByCourse.set(session.courseId, []);
        }
        sessionsByCourse.get(session.courseId)!.push(session);
      });

      // Create sessions in database
      // For courses with multiple sessions, create separate session records
      // (not consecutive slots - each is a separate session)
      for (const session of sessions) {
        try {
          // Validate session data
          if (!session.courseId || !session.instructorId || !session.roomId || !session.timeSlotId) {
            console.warn('Invalid session data:', session);
            conflictsFound++;
            continue;
          }

          // Use validCourses since that's what was passed to the generator
          const course = validCourses.find(c => c.id === session.courseId);
          if (!course) {
            console.warn(`Course not found for session: ${session.courseId}`);
            conflictsFound++;
            continue;
          }

          // Verify time slot exists
          const timeSlot = timeSlots.find(ts => ts.id === session.timeSlotId);
          if (!timeSlot) {
            console.warn(`Time slot not found: ${session.timeSlotId}`);
            conflictsFound++;
            continue;
          }

          // Verify room exists
          const room = rooms.find(r => r.id === session.roomId);
          if (!room) {
            console.warn(`Room not found: ${session.roomId}`);
            conflictsFound++;
            continue;
          }

          const sessionData: any = {
            timetableId: timetable.id,
            courseId: session.courseId,
            instructorId: session.instructorId,
            roomId: session.roomId,
            timeSlotId: session.timeSlotId, // Single time slot per session
            weekNumber: session.weekNumber,
            programType: session.programType || 'DAY',
            group: session.group,
            isActive: true,
          };

          // Add departmentId if available
          if (validatedData.departmentId) {
            sessionData.departmentId = validatedData.departmentId;
          } else {
            // Get department from course for whole-school timetable
            if (course?.departmentId) {
              sessionData.departmentId = course.departmentId;
            } else {
              console.warn(`Course ${course.code} has no departmentId`);
              conflictsFound++;
              continue;
            }
          }

          // Add session type based on course type
          sessionData.sessionType = course.type || 'THEORY';

          // Note: We no longer use consecutiveSlots - each session is independent
          // Multiple sessions for the same course are separate records

          await prisma.timetableSession.create({
            data: sessionData,
          });
          sessionsCreated++;
        } catch (error) {
          console.error(`Error creating session for course ${session.courseId}:`, error);
          conflictsFound++;

          // Log detailed error for debugging
          if (error instanceof Error) {
            console.error('Error details:', {
              message: error.message,
              stack: error.stack,
              courseId: session.courseId,
              instructorId: session.instructorId,
              roomId: session.roomId,
              timeSlotId: session.timeSlotId,
            });
          }
        }
      }

      // Update timetable status
      // Only mark as GENERATED if we created at least some sessions
      // If no sessions were created, mark as FAILED
      const finalStatus = sessionsCreated > 0 ? 'GENERATED' : 'FAILED';

      if (finalStatus === 'FAILED') {
        console.error(`Timetable generation failed: ${sessionsCreated} sessions created, ${conflictsFound} conflicts`);
        console.error(`Total sessions generated by algorithm: ${sessions.length}`);
        console.error(`Valid courses: ${validCourses.length}, Rooms: ${rooms.length}, Time slots: ${timeSlots.length}`);
      }

      await prisma.timetable.update({
        where: { id: timetable.id },
        data: {
          status: finalStatus,
        },
      });

      // Update generation log
      await prisma.generationLog.update({
        where: { id: generationLog.id },
        data: {
          status: sessionsCreated > 0 ? 'GENERATED' : 'FAILED',
          endTime: new Date(),
          coursesProcessed: validCourses.length,
          sessionsGenerated: sessionsCreated,
          conflictsFound: conflictsFound,
          logs: {
            ...generationLog.logs as any,
            sessionsCreated,
            conflictsFound,
            statistics: stats,
            totalCourses: courses.length,
            validCourses: validCourses.length,
            message: sessionsCreated > 0
              ? `Successfully generated ${sessionsCreated} sessions from ${validCourses.length} courses`
              : `Generation failed: ${sessionsCreated} sessions created, ${conflictsFound} conflicts found`,
          },
        },
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'GENERATE',
          entityType: 'Timetable',
          entityId: timetable.id,
          changes: {
            departmentId: validatedData.departmentId,
            semesterId: validatedData.semesterId,
            method: validatedData.method,
            sessionsGenerated: sessionsCreated,
            conflictsFound: conflictsFound,
          } as any,
          ipAddress: (req as any).ip,
          userAgent: (req as any).get('User-Agent'),
        },
      });

      res.status(200).json({
        success: true,
        message: `Timetable generated successfully with ${sessionsCreated} sessions`,
        data: {
          timetableId: timetable.id,
          status: sessionsCreated > 0 ? 'GENERATED' : 'FAILED',
          sessionsGenerated: sessionsCreated,
          conflictsFound: conflictsFound,
          statistics: stats,
        },
      });
    } catch (error) {
      console.error('Timetable generation error:', error);

      // Update timetable status to failed
      await prisma.timetable.update({
        where: { id: timetable.id },
        data: {
          status: 'FAILED',
        },
      }).catch(err => console.error('Error updating timetable status:', err));

      // Update generation log with detailed error
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      await prisma.generationLog.update({
        where: { id: generationLog.id },
        data: {
          status: 'FAILED',
          endTime: new Date(),
          logs: {
            ...generationLog.logs as any,
            error: errorMessage,
            errorStack: errorStack,
            message: `Generation failed: ${errorMessage}`,
            coursesCount: validCourses.length,
            roomsCount: rooms.length,
            timeSlotsCount: timeSlots.length,
          },
        },
      }).catch(err => console.error('Error updating generation log:', err));

      // Re-throw to be caught by outer catch block
      throw error;
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors,
      });
    }

    console.error('Error generating timetable:', error);

    // Provide more detailed error information
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorDetails = error instanceof Error && error.stack ? error.stack : undefined;

    res.status(500).json({
      success: false,
      message: 'Failed to generate timetable',
      error: errorMessage,
      details: errorDetails,
      hint: 'Check server logs for more details. Common issues: missing instructors, no available rooms, or no time slots configured.',
    });
  }
};

/**
 * Update timetable
 */
export const updateTimetable = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const validatedData = updateTimetableSchema.parse(req.body);

    const timetable = await prisma.timetable.findUnique({
      where: { id },
    });

    if (!timetable) {
      return res.status(404).json({
        success: false,
        message: 'Timetable not found',
      });
    }

    // Convert date strings to Date objects if provided
    const updateData: any = { ...validatedData };
    if (validatedData.validFrom && typeof validatedData.validFrom === 'string') {
      updateData.validFrom = new Date(validatedData.validFrom);
    }
    if (validatedData.validTo && typeof validatedData.validTo === 'string') {
      updateData.validTo = new Date(validatedData.validTo);
    }

    const updatedTimetable = await prisma.timetable.update({
      where: { id },
      data: updateData,
      include: {
        department: {
          select: {
            code: true,
            name: true,
          },
        },
        semester: {
          select: {
            name: true,
            type: true,
          },
        },
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'UPDATE',
        entityType: 'Timetable',
        entityId: updatedTimetable.id,
        changes: { changes: validatedData } as any,
        ipAddress: req.ip,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Timetable updated successfully',
      data: updatedTimetable,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors,
      });
    }

    console.error('Error updating timetable:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update timetable',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Delete timetable
 */
export const deleteTimetable = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const timetable = await prisma.timetable.findUnique({
      where: { id },
      include: {
        sessions: true,
      },
    });

    if (!timetable) {
      return res.status(404).json({
        success: false,
        message: 'Timetable not found',
      });
    }

    // Check if published
    if (timetable.status === 'PUBLISHED') {
      return res.status(409).json({
        success: false,
        message: 'Cannot delete published timetable. Unpublish it first.',
      });
    }

    await prisma.timetable.delete({
      where: { id },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'DELETE',
        entityType: 'Timetable',
        entityId: id,
        changes: { name: timetable.name } as any,
        ipAddress: req.ip,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Timetable deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting timetable:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete timetable',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Publish timetable
 */
export const publishTimetable = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const timetable = await prisma.timetable.findUnique({
      where: { id },
      include: {
        sessions: true,
        conflicts: true,
      },
    });

    if (!timetable) {
      return res.status(404).json({
        success: false,
        message: 'Timetable not found',
      });
    }

    // Check if timetable is generated
    if (timetable.status !== 'GENERATED') {
      return res.status(400).json({
        success: false,
        message: `Cannot publish timetable with status: ${timetable.status}. Must be GENERATED.`,
      });
    }

    // Check for conflicts
    if (timetable.conflicts.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Cannot publish timetable with conflicts',
        details: {
          conflictCount: timetable.conflicts.length,
        },
      });
    }

    // Check if has sessions
    if (timetable.sessions.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot publish empty timetable',
      });
    }

    const updatedTimetable = await prisma.timetable.update({
      where: { id },
      data: {
        status: 'PUBLISHED' as any,
        publishedAt: new Date(),
        isActive: true,
      },
      include: {
        department: {
          select: {
            code: true,
            name: true,
          },
        },
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'PUBLISH',
        entityType: 'Timetable',
        entityId: updatedTimetable.id,
        changes: { name: timetable.name } as any,
        ipAddress: req.ip,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Timetable published successfully',
      data: updatedTimetable,
    });
  } catch (error) {
    console.error('Error publishing timetable:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to publish timetable',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Unpublish timetable
 */
export const unpublishTimetable = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const timetable = await prisma.timetable.findUnique({
      where: { id },
    });

    if (!timetable) {
      return res.status(404).json({
        success: false,
        message: 'Timetable not found',
      });
    }

    if (timetable.status !== 'PUBLISHED') {
      return res.status(400).json({
        success: false,
        message: 'Timetable is not published',
      });
    }

    const updatedTimetable = await prisma.timetable.update({
      where: { id },
      data: {
        status: 'GENERATED' as any,
        isActive: false,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'UPDATE',
        entityType: 'Timetable',
        entityId: updatedTimetable.id,
        changes: { action: 'unpublish' } as any,
        ipAddress: req.ip,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Timetable unpublished successfully',
      data: updatedTimetable,
    });
  } catch (error) {
    console.error('Error unpublishing timetable:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to unpublish timetable',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Get timetable conflicts
 */
export const getTimetableConflicts = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const timetable = await prisma.timetable.findUnique({
      where: { id },
    });

    if (!timetable) {
      return res.status(404).json({
        success: false,
        message: 'Timetable not found',
      });
    }

    const conflicts = await prisma.conflict.findMany({
      where: {
        timetableId: id,
      },
      orderBy: {
        severity: 'desc',
      },
    });

    res.status(200).json({
      success: true,
      message: 'Timetable conflicts retrieved successfully',
      data: {
        timetable: {
          id: timetable.id,
          name: timetable.name,
          conflictCount: timetable.conflictCount,
        },
        conflicts,
        summary: {
          total: conflicts.length,
          byType: conflicts.reduce((acc: any, conflict: any) => {
            acc[conflict.type] = (acc[conflict.type] || 0) + 1;
            return acc;
          }, {}),
        },
      },
    });
  } catch (error) {
    console.error('Error fetching conflicts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch conflicts',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Export timetable as PDF
 */
export const exportTimetablePDF = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { format = 'pdf', type = 'department', weekNumber } = req.query;

    if (format !== 'pdf') {
      return res.status(400).json({
        success: false,
        message: 'Only PDF format is supported',
        error: 'UNSUPPORTED_FORMAT',
      });
    }

    const timetableId = id;
    const weekNum = weekNumber ? parseInt(weekNumber as string, 10) : undefined;

    // Fetch timetable to check if it's school-wide (has no department or has "School-Wide" in name)
    const timetable = await prisma.timetable.findUnique({
      where: { id: timetableId },
      select: {
        id: true,
        name: true,
        departmentId: true,
        department: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        sessions: {
          select: {
            course: {
              select: {
                department: {
                  select: {
                    id: true,
                    code: true,
                  },
                },
              },
            },
          },
          take: 50, // Sample to detect multi-department
        },
      },
    });

    if (!timetable) {
      return res.status(404).json({
        success: false,
        message: 'Timetable not found',
      });
    }

    // Detect if this is a school-wide timetable
    const isSchoolWideName = timetable.name.toLowerCase().includes('school-wide') ||
      timetable.name.toLowerCase().includes('schoolwide');

    // Count unique departments in sessions
    const uniqueDepartments = new Set(
      timetable.sessions
        .map(s => s.course?.department?.id)
        .filter(Boolean)
    );
    const hasMultipleDepartments = uniqueDepartments.size > 1;

    // Determine the actual type to use
    let actualType: 'department' | 'instructor' | 'student' | 'school' = type as any;

    if (type === 'department' && (isSchoolWideName || hasMultipleDepartments || !timetable.departmentId)) {
      actualType = 'school';
      console.log('[PDF Export] Detected school-wide timetable:');
      console.log('  - Name contains "school-wide":', isSchoolWideName);
      console.log('  - Multiple departments in sessions:', hasMultipleDepartments, `(${uniqueDepartments.size} depts)`);
      console.log('  - No department assigned:', !timetable.departmentId);
      console.log('  - Overriding type from "department" to "school"');
    }

    // Generate PDF
    const pdfResult = await generateTimetablePDF({
      timetableId,
      type: actualType,
    });

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${pdfResult.fileName}"`);
    res.setHeader('Content-Length', pdfResult.pdfBuffer.length.toString());

    // Send PDF buffer
    res.send(pdfResult.pdfBuffer);
  } catch (error) {
    console.error('Error exporting timetable PDF:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export timetable PDF',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Duplicate an existing timetable (Rollover)
 */
export const duplicateTimetable = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { weekNumber, validFrom, validTo, name } = req.body;

    // Fetch original timetable and its sessions
    const originalTimetable = await prisma.timetable.findUnique({
      where: { id },
      include: {
        sessions: true,
      },
    });

    if (!originalTimetable) {
      return res.status(404).json({
        success: false,
        message: 'Original timetable not found',
      });
    }

    // Prepare duplicate data
    const newWeekNumber = weekNumber || (originalTimetable.weekNumber + 1);
    const existingName = originalTimetable.name;
    let newName = name;
    
    if (!newName) {
      // Try to intelligently update the week number in the name
      if (/Week \d+/i.test(existingName)) {
        newName = existingName.replace(/Week \d+/i, `Week ${newWeekNumber}`);
      } else {
        newName = `${existingName} (Copy Week ${newWeekNumber})`;
      }
    }

    // Create new timetable
    const duplicatedTimetable = await prisma.timetable.create({
      data: {
        name: newName,
        description: originalTimetable.description,
        departmentId: originalTimetable.departmentId,
        semesterId: originalTimetable.semesterId,
        weekNumber: newWeekNumber,
        validFrom: validFrom ? new Date(validFrom) : originalTimetable.validFrom,
        validTo: validTo ? new Date(validTo) : originalTimetable.validTo,
        status: 'GENERATED', // New copy starts as GENERATED
        isActive: false,
        generationMethod: originalTimetable.generationMethod,
        createdById: req.user.id,
      },
    });

    // Duplicate all sessions
    if (originalTimetable.sessions.length > 0) {
      const sessionData = originalTimetable.sessions.map((session) => ({
        courseId: session.courseId,
        instructorId: session.instructorId,
        roomId: session.roomId,
        timeSlotId: session.timeSlotId,
        timetableId: duplicatedTimetable.id,
        weekNumber: newWeekNumber,
        departmentId: session.departmentId || originalTimetable.departmentId,
        programType: session.programType,
        group: session.group,
        isActive: true,
      }));

      await prisma.timetableSession.createMany({
        data: sessionData,
      });
    }

    res.status(201).json({
      success: true,
      message: 'Timetable duplicated successfully',
      data: duplicatedTimetable,
    });
  } catch (error) {
    console.error('Error duplicating timetable:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to duplicate timetable',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};




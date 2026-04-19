import prisma from '../config/prisma.js';

interface TimetableSession {
  courseId: string;
  instructorId: string;
  roomId: string;
  timeSlotId: string;
  weekNumber: number;
  programType?: string;
  group?: string; // Group A or Group B for split classes
}

interface GenerationConstraints {
  maxInstructorHours?: number;
  preferMorningSlots?: boolean;
  avoidBackToBack?: boolean;
  minGapBetweenSessions?: number; // minutes
  balanceAcrossDays?: boolean;
  maxSessionsPerDay?: number;
}

interface ConflictInfo {
  type: string;
  description: string;
  courseId?: string;
  instructorId?: string;
  roomId?: string;
  timeSlotId?: string;
}

/**
 * Enhanced Timetable Generator with Constraint Satisfaction
 * This algorithm assigns courses to time slots, rooms, and instructors
 * while respecting hard constraints and optimizing for soft constraints.
 * Supports multiple sessions per course and balanced distribution.
 */
export class TimetableGenerator {
  private courses: any[];
  private rooms: any[];
  private timeSlots: any[];
  private instructorAvailability: Map<string, any[]>;
  private constraints: GenerationConstraints;
  private assignedSessions: TimetableSession[] = [];
  private roomBookings: Map<string, Array<{ timeSlotId: string; day: string; startTime: string; endTime: string }>> = new Map(); // roomId -> Array of bookings with time details
  private instructorBookings: Map<string, Set<string>> = new Map(); // instructorId -> Set of timeSlotIds
  private globalTimeBookings: Set<string> = new Set(); // Set of "day-startTime-endTime" to prevent any overlap
  private instructorHours: Map<string, number> = new Map(); // instructorId -> hours
  private dayDistribution: Map<string, number> = new Map(); // day -> session count
  private conflicts: ConflictInfo[] = [];
  private courseSessionsAssigned: Map<string, number> = new Map(); // courseId -> sessions assigned
  private studentGroupBookings: Map<string, Set<string>> = new Map(); // groupKey -> Set of slotIds
  private suitableRoomsCache: Map<string, any[]> = new Map(); // courseId -> suitable rooms
  private departmentSettings: any = null;


  constructor(
    courses: any[],
    rooms: any[],
    timeSlots: any[],
    instructorAvailability: Map<string, any[]>,
    constraints: GenerationConstraints = {}
  ) {
    this.courses = courses;
    this.rooms = rooms;
    this.timeSlots = timeSlots;
    this.instructorAvailability = instructorAvailability;
    this.constraints = {
      preferMorningSlots: true,
      avoidBackToBack: false, // Relaxed by default
      balanceAcrossDays: false, // Relaxed by default - only apply if explicitly set
      maxSessionsPerDay: undefined, // No limit by default
      minGapBetweenSessions: 0,
      ...constraints
    };

    // Initialize tracking maps
    rooms.forEach(room => {
      this.roomBookings.set(room.id, []);
    });

    const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
    days.forEach(day => {
      this.dayDistribution.set(day, 0);
    });

    courses.forEach(course => {
      if (course.instructorId) {
        this.instructorBookings.set(course.instructorId, new Set());
        this.instructorHours.set(course.instructorId, 0);
      }
      this.courseSessionsAssigned.set(course.id, 0);
    });
  }

  /**
   * Generate timetable using enhanced constraint satisfaction algorithm
   * Improved version with retry mechanism and better multi-session handling
   */
  async generate(weekNumber: number): Promise<TimetableSession[]> {
    this.assignedSessions = [];
    this.conflicts = [];

    // Reset all tracking maps
    this.roomBookings.clear();
    this.instructorBookings.clear();
    this.globalTimeBookings.clear();
    this.instructorHours.clear();
    this.dayDistribution.clear();
    this.courseSessionsAssigned.clear();
    this.studentGroupBookings.clear();

    // Re-initialize tracking maps
    this.rooms.forEach(room => {
      this.roomBookings.set(room.id, []);
    });

    const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
    days.forEach(day => {
      this.dayDistribution.set(day, 0);
    });

    this.courses.forEach(course => {
      if (course.instructorId) {
        this.instructorBookings.set(course.instructorId, new Set());
        this.instructorHours.set(course.instructorId, 0);
      }
      this.courseSessionsAssigned.set(course.id, 0);
    });

    // Load department settings for hour constraints
    if (this.courses.length > 0) {
      try {
        const dept = await prisma.department.findUnique({
          where: { id: this.courses[0].departmentId }
        });
        this.departmentSettings = dept;
      } catch (e) {
        console.error("[GENERATOR] Failed to load department settings", e);
      }
    }

    // Sort courses by priority (credits, then enrollment, then course code)
    const sortedCourses = [...this.courses].sort((a, b) => {
      if (b.credits !== a.credits) {
        return b.credits - a.credits; // Higher credits first
      }
      const aEnroll = a.enrolledStudents || a.currentEnrollment || 0;
      const bEnroll = b.enrolledStudents || b.currentEnrollment || 0;
      if (bEnroll !== aEnroll) {
        return bEnroll - aEnroll; // More students first
      }
      return a.code.localeCompare(b.code);
    });

    // Sort time slots (prefer morning if constraint is set)
    const sortedTimeSlots = this.sortTimeSlots([...this.timeSlots]);

    console.log(`[GENERATOR] Starting assignment for ${sortedCourses.length} courses`);

    for (const course of sortedCourses) {
      const { needed: sessionsNeeded, isSplit } = this.calculateSessionsNeeded(course);

      console.log(`[GENERATOR] Processing course ${course.code} - needs ${sessionsNeeded} sessions`);

      // Regular assignment: separate sessions to spread course evenly across the week!
      let sessionsAssigned = 0;
      const assignedDays = new Set<string>();

      for (let i = 0; i < sessionsNeeded; i++) {
        let session: TimetableSession | null = null;
        let attempts = 0;
        const maxAttempts = 100;

        while (!session && attempts < maxAttempts) {
          session = this.findBestAssignment(
            course,
            sortedTimeSlots,
            weekNumber,
            assignedDays,
            i,
            isSplit
          );

          if (!session && attempts < maxAttempts - 1) {
            attempts++;
            if (attempts % 10 === 0) {
              sortedTimeSlots.sort(() => Math.random() - 0.5);
            }
          } else {
            attempts++;
          }
        }

        if (session) {
          this.assignedSessions.push(session);
          this.markAsBooked(session);
          sessionsAssigned++;

          const sessionSlot = this.timeSlots.find(ts => ts.id === session!.timeSlotId);
          if (sessionSlot) {
            assignedDays.add(sessionSlot.day);
          }

          this.courseSessionsAssigned.set(course.id, sessionsAssigned);
        } else {
          console.log(`[GENERATOR]   ✗ Could not assign session ${i + 1}/${sessionsNeeded} for ${course.code}`);
          this.conflicts.push({
            type: 'ASSIGNMENT_FAILED',
            description: `Could not assign session ${i + 1} for course ${course.code}`,
            courseId: course.id
          });
        }
      }

      const finalAssigned = this.courseSessionsAssigned.get(course.id) || 0;
      if (finalAssigned < sessionsNeeded) {
        console.log(`[GENERATOR] ⚠ Course ${course.code} only got ${finalAssigned}/${sessionsNeeded} sessions assigned`);
      } else {
        console.log(`[GENERATOR] ✓ Course ${course.code} fully assigned: ${finalAssigned}/${sessionsNeeded} sessions`);
      }
    }

    // Second pass: Retry incomplete courses with relaxed constraints
    console.log(`[GENERATOR] Second pass: Retrying incomplete courses...`);
    this.retryIncompleteCourses(sortedCourses, sortedTimeSlots, weekNumber);

    // Third pass: Optimization - try to improve assignments
    this.optimizeAssignments(sortedTimeSlots, weekNumber);

    // Fourth pass: Fill ALL remaining empty slots to maximize timetable utilization
    console.log(`[GENERATOR] Fourth pass: Filling remaining empty slots...`);
    this.fillAllEmptySlots(sortedCourses, sortedTimeSlots, weekNumber);

    return this.assignedSessions;
  }


  private assignConsecutiveSlots(
    course: any,
    sortedTimeSlots: any[],
    weekNumber: number,
    sessionsNeeded: number,
    isSplit: boolean = false,
    groupB: boolean = false
  ): TimetableSession[] {
    const suitableRooms = this.findSuitableRooms(course);
    if (suitableRooms.length === 0) return [];

    const instructorId = course.instructorId;
    if (!instructorId) return [];

    const instructorAvail = this.instructorAvailability.get(instructorId) || [];

    // Filter slots by Group A/B if split
    let filteredSortedSlots = sortedTimeSlots;
    if (isSplit) {
      filteredSortedSlots = sortedTimeSlots.filter(slot => {
        const minutes = this.timeToMinutes(slot.startTime);
        if (groupB) return minutes >= 780 && minutes < 1020; // 1PM-5PM
        return minutes >= 480 && minutes < 720; // 8AM-12PM
      });
    }

    // Group time slots by day
    const slotsByDay: Record<string, any[]> = {};
    filteredSortedSlots.forEach(slot => {
      if (slot.isBreak) return;
      if (!this.isSlotDayAllowedForCourseProgram(course, slot)) return;
      if (!slotsByDay[slot.day]) {
        slotsByDay[slot.day] = [];
      }
      slotsByDay[slot.day].push(slot);
    });

    const days =
      (course?.programType || 'DAY') === 'WEEKEND'
        ? ['SATURDAY', 'SUNDAY']
        : ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];

    for (const day of days) {
      const daySlots = slotsByDay[day] || [];
      if (daySlots.length < sessionsNeeded) continue;

      const sortedDaySlots = daySlots.sort((a, b) => a.startTime.localeCompare(b.startTime));

      for (let startIdx = 0; startIdx <= sortedDaySlots.length - sessionsNeeded; startIdx++) {
        const consecutiveSlots = sortedDaySlots.slice(startIdx, startIdx + sessionsNeeded);

        let isConsecutive = true;
        for (let i = 0; i < consecutiveSlots.length - 1; i++) {
          const currentEndMinutes = this.timeToMinutes(consecutiveSlots[i].endTime);
          const nextStartMinutes = this.timeToMinutes(consecutiveSlots[i + 1].startTime);
          if (nextStartMinutes - currentEndMinutes > 15) { // Lenient gap
            isConsecutive = false;
            break;
          }
        }

        if (!isConsecutive) continue;

        // Check compatibility
        let compatible = true;
        for (const slot of consecutiveSlots) {
          if (course.programType && slot.programType && course.programType !== slot.programType) {
            compatible = false;
            break;
          }
          if (!this.isInstructorAvailable(instructorId, slot, instructorAvail) ||
            this.instructorBookings.get(instructorId)?.has(slot.id)) {
            compatible = false;
            break;
          }
        }
        if (!compatible) continue;

        // NEW: Check Student Group clash and Prerequisites
        const groupKey = this.getGroupKey(course, isSplit, groupB);
        let groupCompatible = true;
        for (const slot of consecutiveSlots) {
          if (this.studentGroupBookings.get(groupKey)?.has(slot.id)) {
            groupCompatible = false;
            break;
          }
          if (!this.checkPrerequisites(course, slot, groupKey)) {
            groupCompatible = false;
            break;
          }
        }
        if (!groupCompatible) continue;

        // Try to find a room
        for (const room of suitableRooms) {
          let roomAvailable = true;
          for (const slot of consecutiveSlots) {
            const roomBookings = this.roomBookings.get(room.id) || [];
            if (roomBookings.some(booking => booking.day === slot.day && this.timesOverlap(slot.startTime, slot.endTime, booking.startTime, booking.endTime))) {
              roomAvailable = false;
              break;
            }
          }

          if (roomAvailable) {
            return consecutiveSlots.map(slot => ({
              courseId: course.id,
              instructorId: instructorId,
              roomId: room.id,
              timeSlotId: slot.id,
              weekNumber: weekNumber,
              programType: slot.programType || 'DAY',
              group: isSplit ? (groupB ? 'Group B' : 'Group A') : undefined,
            }));
          }
        }
      }
    }

    return [];
  }

  private calculateSessionsNeeded(course: any): { needed: number, isSplit: boolean } {
    const baseSessions = course.weeklyHours || course.credits || 3;
    const isSplit = (course.currentEnrollment || 0) > (course.minSplitSize || 40);
    const needed = isSplit ? baseSessions * 2 : baseSessions;
    return { needed, isSplit };
  }

  private findBestAssignment(
    course: any,
    sortedTimeSlots: any[],
    weekNumber: number,
    assignedDays: Set<string> = new Set(),
    sessionIndex: number = 0,
    isSplit: boolean = false
  ): TimetableSession | null {
    const suitableRooms = this.findSuitableRooms(course);
    if (suitableRooms.length === 0) return null;

    const instructorId = course.instructorId;
    if (!instructorId) return null;

    const instructorAvail = this.instructorAvailability.get(instructorId) || [];

    // Filter time slots based on Group A/B if splitting is active
    let filteredSlots = sortedTimeSlots;
    if (isSplit) {
      const baseSessions = Math.ceil((course.weeklyHours || course.credits || 3));
      const isGroupB = sessionIndex >= baseSessions;

      filteredSlots = sortedTimeSlots.filter(slot => {
        const minutes = this.timeToMinutes(slot.startTime);
        if (isGroupB) {
          // Group B: 1PM - 5PM (13:00 - 17:00) 
          return minutes >= 780 && minutes < 1020;
        } else {
          // Group A: 8AM - 12PM (08:00 - 12:00)
          return minutes >= 480 && minutes < 720;
        }
      });
    }

    filteredSlots = filteredSlots.filter((slot) => this.isSlotDayAllowedForCourseProgram(course, slot));

    // Try each time slot with scoring
    let bestAssignment: TimetableSession | null = null;
    let bestScore = -1;

    // Use random offset for better distribution
    const candidateSlots = [...filteredSlots];
    const startOffset = Math.floor(Math.random() * candidateSlots.length);

    for (let i = 0; i < candidateSlots.length; i++) {
      const index = (i + startOffset) % candidateSlots.length;
      const timeSlot = candidateSlots[index];

      if (timeSlot.isBreak) continue;

      const courseProgramType = course.programType || 'DAY';
      const inferredProgramType = this.inferProgramType(timeSlot);
      if (courseProgramType !== inferredProgramType) continue;

      // Hard constraints
      if (!this.isInstructorAvailable(instructorId, timeSlot, instructorAvail)) continue;
      if (this.instructorBookings.get(instructorId)?.has(timeSlot.id)) continue;

      // NEW: Check Student Group clash
      const groupKey = this.getGroupKey(course, isSplit, sessionIndex >= Math.ceil((course.weeklyHours || course.credits || 3)));
      if (this.studentGroupBookings.get(groupKey)?.has(timeSlot.id)) continue;

      // NEW: Check Prerequisites
      if (!this.checkPrerequisites(course, timeSlot, groupKey)) continue;

      // Check daily instructor hours from department settings
      if (this.departmentSettings) {
        const currentHoursOnDay = this.getInstructorHoursOnDay(instructorId, timeSlot.day);
        const slotDuration = this.getSlotDuration(timeSlot) / 60; // in hours

        let limit = 8; // default
        if (timeSlot.programType === 'DAY') limit = this.departmentSettings.dailyDayHours || 6;
        if (timeSlot.programType === 'EVENING') limit = this.departmentSettings.dailyEveningHours || 4;
        if (timeSlot.programType === 'WEEKEND') {
          limit = (timeSlot.day === 'SUNDAY') ? (this.departmentSettings.dailyWeekendSunHours || 6) : (this.departmentSettings.dailyWeekendSatHours || 4);
        }

        if (currentHoursOnDay + slotDuration > limit) continue;
      }

      for (const room of suitableRooms) {
        const roomBookings = this.roomBookings.get(room.id) || [];
        const hasConflict = roomBookings.some(booking =>
          booking.day === timeSlot.day &&
          this.timesOverlap(timeSlot.startTime, timeSlot.endTime, booking.startTime, booking.endTime)
        );

        if (!hasConflict) {
          const score = this.calculateAssignmentScore(timeSlot, room, instructorId, course, assignedDays, sessionIndex);
          if (score > bestScore) {
            bestScore = score;
            bestAssignment = {
              courseId: course.id,
              instructorId: instructorId,
              roomId: room.id,
              timeSlotId: timeSlot.id,
              weekNumber: weekNumber,
              programType: timeSlot.programType || 'DAY',
              group: isSplit ? (sessionIndex >= Math.ceil((course.weeklyHours || course.credits || 3)) ? 'Group B' : 'Group A') : undefined,
            };
          }
        }
      }
      if (bestAssignment && bestScore > 80) break;
    }

    return bestAssignment;
  }

  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private getInstructorHoursOnDay(instructorId: string, day: string): number {
    const daySessions = this.assignedSessions.filter(s => s.instructorId === instructorId);
    let totalMinutes = 0;
    for (const session of daySessions) {
      const slot = this.timeSlots.find(ts => ts.id === session.timeSlotId);
      if (slot && slot.day === day) {
        totalMinutes += this.getSlotDuration(slot);
      }
    }
    return totalMinutes / 60;
  }

  private sortTimeSlots(timeSlots: any[]): any[] {
    return timeSlots.sort((a, b) => {
      if (this.constraints.preferMorningSlots) {
        const aHour = parseInt(a.startTime.split(':')[0]);
        const bHour = parseInt(b.startTime.split(':')[0]);
        if (aHour !== bHour) {
          return aHour - bHour;
        }
      }

      const dayOrder: Record<string, number> = {
        MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6, SUNDAY: 7,
      };

      if (dayOrder[a.day] !== dayOrder[b.day]) {
        return dayOrder[a.day] - dayOrder[b.day];
      }

      return a.startTime.localeCompare(b.startTime);
    });
  }


  /**
   * CRITICAL: Retry incomplete courses with VERY relaxed constraints
   * This ensures ALL courses get their full session count
   */
  private retryIncompleteCourses(
    courses: any[],
    sortedTimeSlots: any[],
    weekNumber: number
  ): void {
    // Find all courses that didn't get all their sessions
    const incompleteCourses = courses.filter(course => {
      const assigned = this.courseSessionsAssigned.get(course.id) || 0;
      const { needed } = this.calculateSessionsNeeded(course);
      return assigned < needed;
    });

    if (incompleteCourses.length === 0) {
      console.log(`[GENERATOR] All courses complete! No retry needed.`);
      return;
    }

    console.log(`[GENERATOR] Found ${incompleteCourses.length} incomplete courses, retrying with relaxed constraints...`);

    for (const course of incompleteCourses) {
      const assigned = this.courseSessionsAssigned.get(course.id) || 0;
      const { needed, isSplit } = this.calculateSessionsNeeded(course);
      const remaining = needed - assigned;

      console.log(`[GENERATOR]   Retrying ${course.code}: needs ${remaining} more sessions (${assigned}/${needed})`);

      const instructorId = course.instructorId;
      if (!instructorId) continue;

      const instructorAvail = this.instructorAvailability.get(instructorId) || [];
      const suitableRooms = this.findSuitableRooms(course);

      // Try VERY aggressively to assign remaining sessions
      for (let i = 0; i < remaining; i++) {
        let sessionAssigned = false;

        // Try ALL timeslots (not just sorted order)
        const shuffledSlots = [...sortedTimeSlots].sort(() => Math.random() - 0.5);

        for (const slot of shuffledSlots) {
          if (slot.isBreak) continue;

          // CRITICAL: NEVER cross program boundaries! (e.g., DAY course cannot jump to WEEKEND)
          const courseProgramType = course.programType || 'DAY';
          const inferredProgramType = this.inferProgramType(slot);
          if (courseProgramType !== inferredProgramType) continue;
          
          // Adventist Strict Days Rule
          if (!this.isSlotDayAllowedForCourseProgram(course, slot)) continue;

          // Check instructor availability (but be lenient)
          if (instructorAvail.length > 0) {
            if (!this.isInstructorAvailable(instructorId, slot, instructorAvail)) continue;
          }

          // Check if instructor is already booked
          if (this.instructorBookings.get(instructorId)?.has(slot.id)) continue;

          // Try to find ANY available room
          for (const room of suitableRooms) {
            const roomBookings = this.roomBookings.get(room.id) || [];
            const hasConflict = roomBookings.some(booking =>
              booking.day === slot.day &&
              this.timesOverlap(slot.startTime, slot.endTime, booking.startTime, booking.endTime)
            );

            if (!hasConflict) {
              // SUCCESS! Assign this session
              const session: TimetableSession = {
                courseId: course.id,
                instructorId: instructorId,
                roomId: room.id,
                timeSlotId: slot.id,
                weekNumber: weekNumber,
                programType: slot.programType || 'DAY',
                group: isSplit ? (i + assigned >= Math.ceil((course.weeklyHours || course.credits || 3)) ? 'Group B' : 'Group A') : undefined,
              };

              this.assignedSessions.push(session);
              this.markAsBooked(session);

              const current = this.courseSessionsAssigned.get(course.id) || 0;
              this.courseSessionsAssigned.set(course.id, current + 1);

              sessionAssigned = true;
              console.log(`[GENERATOR]     ✓ Assigned session ${i + 1}/${remaining} for ${course.code} to ${slot.day} ${slot.startTime}`);
              break;
            }
          }

          if (sessionAssigned) break;
        }

        if (!sessionAssigned) {
          console.log(`[GENERATOR]     ✗ Could not assign session ${i + 1}/${remaining} for ${course.code} (no available slots)`);
        }
      }
    }

    // Report final status
    const stillIncomplete = incompleteCourses.filter(course => {
      const assigned = this.courseSessionsAssigned.get(course.id) || 0;
      const { needed } = this.calculateSessionsNeeded(course);
      return assigned < needed;
    });

    if (stillIncomplete.length > 0) {
      console.log(`[GENERATOR] ⚠ ${stillIncomplete.length} courses still incomplete after retry:`);
      stillIncomplete.forEach(course => {
        const assigned = this.courseSessionsAssigned.get(course.id) || 0;
        const needed = this.calculateSessionsNeeded(course);
        console.log(`[GENERATOR]     ${course.code}: ${assigned}/${needed} sessions`);
      });
    } else {
      console.log(`[GENERATOR] ✓ All courses now complete after retry!`);
    }
  }

  /**
   * SMART FILL: Fill empty slots while maintaining fairness
   * Ensures courses get their required hours first, then distributes extra sessions fairly
   * TARGET: 250 sessions per program (DAY, EVENING, WEEKEND) = 750+ total
   */
  private fillAllEmptySlots(
    courses: any[],
    sortedTimeSlots: any[],
    weekNumber: number
  ): void {
    const currentSessionCount = this.assignedSessions.length;
    console.log(`[GENERATOR]   Starting optimized fill of available room-time combinations...`);
    console.log(`[GENERATOR]   Current sessions: ${currentSessionCount}, Target: 750+ (250 per program)`);

    // Get all courses with instructors
    const availableCourses = courses.filter(c => c.instructorId);
    if (availableCourses.length === 0) return;

    // SESSION TARGETS - CRITICAL: 250 sessions per program
    const PROGRAM_TARGET = 250;
    const TOTAL_TARGET = 750;
    const MAX_SESSION_CAP = 1200;

    // Track sessions per program
    const programCounts: Record<string, number> = {
      DAY: this.assignedSessions.filter(s => this.inferProgramType(this.timeSlots.find(ts => ts.id === s.timeSlotId)) === 'DAY').length,
      EVENING: this.assignedSessions.filter(s => this.inferProgramType(this.timeSlots.find(ts => ts.id === s.timeSlotId)) === 'EVENING').length,
      WEEKEND: this.assignedSessions.filter(s => this.inferProgramType(this.timeSlots.find(ts => ts.id === s.timeSlotId)) === 'WEEKEND').length,
    };

    let MAX_EXTRA_SESSIONS = 60; // Increased from 40 to allow more distribution
    console.log(`[GENERATOR]   Current counts - DAY: ${programCounts.DAY}, EVENING: ${programCounts.EVENING}, WEEKEND: ${programCounts.WEEKEND}`);

    let filledCount = 0;
    let attemptedSlots = 0;
    const shuffledCourses = [...availableCourses].sort(() => Math.random() - 0.5);

    // IMPROVED: Instead of looking for completely empty slots, try to fill ALL room-time combinations
    // CRITICAL: Prioritize each program to reach 250 sessions minimum
    let allProgramsReachedTarget = false;
    let iterationCount = 0;
    const maxIterations = 3; // Multiple passes to ensure all programs are filled

    while (!allProgramsReachedTarget && iterationCount < maxIterations) {
      iterationCount++;
      console.log(`[GENERATOR]   Fill iteration ${iterationCount}...`);

      allProgramsReachedTarget =
        programCounts.DAY >= PROGRAM_TARGET &&
        programCounts.EVENING >= PROGRAM_TARGET &&
        programCounts.WEEKEND >= PROGRAM_TARGET;

      if (allProgramsReachedTarget) {
        console.log(`[GENERATOR]   ✅ All programs reached ${PROGRAM_TARGET} sessions!`);
        break;
      }

      for (const slot of sortedTimeSlots) {
        if (this.assignedSessions.length >= MAX_SESSION_CAP) {
          console.log(`[GENERATOR]   Reached hard cap of ${MAX_SESSION_CAP} sessions. Stopping fill.`);
          break;
        }
        if (slot.isBreak) continue;

        const programType = this.inferProgramType(slot);

        // Skip this program if it already reached target
        if (programCounts[programType] >= PROGRAM_TARGET) continue;

        for (const room of this.rooms) {
          attemptedSlots++;

          // Check if this specific room-time combination is already booked
          const roomBookings = this.roomBookings.get(room.id) || [];
          const isRoomBusy = roomBookings.some(booking =>
            booking.day === slot.day &&
            this.timesOverlap(slot.startTime, slot.endTime, booking.startTime, booking.endTime)
          );

          if (isRoomBusy) continue; // Room already booked at this time

          // Try to find a course that can be scheduled here
          let slotFilled = false;

          for (let attempt = 0; attempt < shuffledCourses.length && !slotFilled; attempt++) {
            const course = shuffledCourses[attempt];
            const instructorId = course.instructorId;
            if (!instructorId) continue;

            // CHECK: Has this course exceeded its limit?
            const assigned = this.courseSessionsAssigned.get(course.id) || 0;
            const required = course.weeklyHours || course.credits || 3;
            const extra = assigned - required;

            if (extra >= MAX_EXTRA_SESSIONS) {
              // This course already has max extras, skip it
              continue;
            }

            // Use cached suitable rooms
            const suitableRooms = this.suitableRoomsCache.get(course.id) || [];
            if (!suitableRooms.some(r => r.id === room.id)) continue;

            // CRITICAL: NEVER cross program boundaries!
            const courseProgramType = course.programType || 'DAY';
            if (courseProgramType !== programType) continue;
            if (!this.isSlotDayAllowedForCourseProgram(course, slot)) continue;

            // Check instructor availability (lenient)
            const instructorAvail = this.instructorAvailability.get(instructorId) || [];
            if (instructorAvail.length > 0) {
              if (!this.isInstructorAvailable(instructorId, slot, instructorAvail)) continue;
            }

            // Check if instructor is already teaching at this time
            if (this.instructorBookings.get(instructorId)?.has(slot.id)) continue;

            // All constraints passed - assign this course to this room-time slot!
            const { isSplit } = this.calculateSessionsNeeded(course);
            const session: TimetableSession = {
              courseId: course.id,
              instructorId: instructorId,
              roomId: room.id,
              timeSlotId: slot.id,
              weekNumber: weekNumber,
              programType: programType,
              group: isSplit ? (assigned >= Math.ceil((course.weeklyHours || course.credits || 0)) ? 'Group B' : 'Group A') : undefined,
            };

            this.assignedSessions.push(session);
            this.markAsBooked(session);

            const current = this.courseSessionsAssigned.get(course.id) || 0;
            this.courseSessionsAssigned.set(course.id, current + 1);
            programCounts[programType]++;

            filledCount++;
            slotFilled = true;
            break; // Move to next room-time slot
          }
        }
      }
    }


    console.log(`[GENERATOR]   ✓ Filled ${filledCount} additional room-time slots`);
    console.log(`[GENERATOR]   ✓ Checked ${attemptedSlots} room-time combinations`);

    // Calculate overall utilization
    const totalPossibleSlots = sortedTimeSlots.filter(s => !s.isBreak).length * this.rooms.length;
    const utilizationPercent = ((this.assignedSessions.length / totalPossibleSlots) * 100).toFixed(1);
    const finalSessionCount = this.assignedSessions.length;
    console.log(`[GENERATOR]   📊 Overall utilization: ${finalSessionCount}/${totalPossibleSlots} (${utilizationPercent}%)`);

    // Check if target was reached
    console.log(`[GENERATOR]   Final counts - DAY: ${programCounts.DAY}, EVENING: ${programCounts.EVENING}, WEEKEND: ${programCounts.WEEKEND}`);
    if (finalSessionCount >= TOTAL_TARGET) {
      console.log(`[GENERATOR]   ✅ TARGET ACHIEVED! Generated ${finalSessionCount} sessions total.`);
      console.log(`[GENERATOR]   ✅ Program Distribution - DAY: ${programCounts.DAY}/250, EVENING: ${programCounts.EVENING}/250, WEEKEND: ${programCounts.WEEKEND}/250`);
    } else {
      console.log(`[GENERATOR]   ⚠️  Target not fully reached. Generated ${finalSessionCount}/${TOTAL_TARGET} sessions.`);
    }

    // Log distribution of extra sessions
    console.log(`[GENERATOR]\n[GENERATOR]   📊 EXTRA SESSIONS DISTRIBUTION (Max: ${MAX_EXTRA_SESSIONS} per course):`);
    const coursesWithExtras = availableCourses.filter(c => {
      const assigned = this.courseSessionsAssigned.get(c.id) || 0;
      const needed = c.weeklyHours || c.credits || 3;
      return assigned > needed;
    });

    if (coursesWithExtras.length > 0) {
      coursesWithExtras.forEach(course => {
        const assigned = this.courseSessionsAssigned.get(course.id) || 0;
        const needed = course.weeklyHours || course.credits || 3;
        const extra = assigned - needed;
        console.log(`[GENERATOR]     ${course.code.padEnd(12)} | Required: ${needed}, Actual: ${assigned}, Extra: +${extra}`);
      });
    } else {
      console.log(`[GENERATOR]     No courses have extra sessions (all exact matches)`);
    }
  }

  /**
   * Optimize assignments by trying to improve room utilization and day distribution
   */
  private optimizeAssignments(sortedTimeSlots: any[], weekNumber: number): void {
    // Try to improve assignments by swapping rooms or time slots
    // This is a simple optimization pass - can be enhanced with more sophisticated algorithms

    for (let i = 0; i < this.assignedSessions.length; i++) {
      const session = this.assignedSessions[i];
      const course = this.courses.find(c => c.id === session.courseId);
      if (!course) continue;

      const currentSlot = this.timeSlots.find(ts => ts.id === session.timeSlotId);
      const currentRoom = this.rooms.find(r => r.id === session.roomId);
      if (!currentSlot || !currentRoom) continue;

      // Try to find a better room or time slot
      const suitableRooms = this.findSuitableRooms(course);
      const instructorId = session.instructorId;
      const instructorAvail = this.instructorAvailability.get(instructorId) || [];

      // Check if we can improve this assignment
      for (const room of suitableRooms) {
        if (room.id === session.roomId) continue; // Skip current room

        for (const timeSlot of sortedTimeSlots) {
          if (timeSlot.id === session.timeSlotId) continue; // Skip current slot
          if (timeSlot.isBreak) continue;

          const courseProgramType = course.programType || 'DAY';
          const inferredProgramType = this.inferProgramType(timeSlot);
          if (courseProgramType !== inferredProgramType) continue;
          if (!this.isSlotDayAllowedForCourseProgram(course, timeSlot)) continue;

          // Check if this is a better assignment
          if (this.isInstructorAvailable(instructorId, timeSlot, instructorAvail) &&
            !this.instructorBookings.get(instructorId)?.has(timeSlot.id)) {

            const roomBookings = this.roomBookings.get(room.id) || [];
            const hasConflict = roomBookings.some(booking =>
              booking.day === timeSlot.day &&
              this.timesOverlap(timeSlot.startTime, timeSlot.endTime, booking.startTime, booking.endTime)
            );

            if (!hasConflict) {
              const currentScore = this.calculateAssignmentScore(
                currentSlot, currentRoom, instructorId, course, new Set(), 0
              );
              const newScore = this.calculateAssignmentScore(
                timeSlot, room, instructorId, course, new Set(), 0
              );

              // If new assignment is significantly better, swap it
              if (newScore > currentScore + 10) {
                // Unbook old assignment
                this.unbookSession(session);

                // Update session
                session.roomId = room.id;
                session.timeSlotId = timeSlot.id;

                // Book new assignment
                this.markAsBooked(session);
                break;
              }
            }
          }
        }
      }
    }
  }

  /**
   * Unbook a session (for optimization)
   */
  private unbookSession(session: TimetableSession): void {
    const slot = this.timeSlots.find(ts => ts.id === session.timeSlotId);
    if (!slot) return;

    // Remove from room bookings
    const roomBookings = this.roomBookings.get(session.roomId) || [];
    const filtered = roomBookings.filter(booking =>
      !(booking.day === slot.day &&
        booking.startTime === slot.startTime &&
        booking.endTime === slot.endTime)
    );
    this.roomBookings.set(session.roomId, filtered);

    // Remove from instructor bookings
    const instructorBookings = this.instructorBookings.get(session.instructorId);
    if (instructorBookings) {
      instructorBookings.delete(slot.id);
    }

    // Remove from global bookings (instructor-specific)
    const timeKey = `${slot.day}-${slot.startTime}-${slot.endTime}-${session.instructorId}`;
    this.globalTimeBookings.delete(timeKey);

    // Update instructor hours
    const currentHours = this.instructorHours.get(session.instructorId) || 0;
    const slotDuration = this.getSlotDuration(slot);
    this.instructorHours.set(session.instructorId, Math.max(0, currentHours - slotDuration));

    // Update day distribution
    const dayCount = this.dayDistribution.get(slot.day) || 0;
    this.dayDistribution.set(slot.day, Math.max(0, dayCount - 1));
  }

  /**
   * Calculate score for assignment (higher is better)
   * Considers soft constraints like morning preference, room utilization, etc.
   * CRITICAL FIX: Removed harsh same-day penalty to allow courses with 10+ hours
   */
  private calculateAssignmentScore(
    timeSlot: any,
    room: any,
    instructorId: string,
    course: any,
    assignedDays: Set<string> = new Set(),
    sessionIndex: number = 0
  ): number {
    let score = 100;

    // IMPROVED: Equal preference for morning AND afternoon (better distribution)
    const hour = parseInt(timeSlot.startTime.split(':')[0]);
    if (hour >= 8 && hour < 12) {
      score += 25; // Morning slots
    } else if (hour >= 12 && hour < 17) {
      score += 25; // Afternoon slots (SAME as morning now!)
    } else {
      score += 10; // Early morning or late afternoon
    }

    // Prefer less crowded days (mild preference)
    const dayCount = this.dayDistribution.get(timeSlot.day) || 0;
    score += Math.max(0, 15 - dayCount);

    // CRITICAL FIX: REMOVED harsh penalty for same-day assignments
    // Old code penalized -15 for reusing same day, preventing 10-hour courses
    // New code: Small bonus for spreading, but NO penalty for same day
    // SPREAD OVER DAYS: Heavily favor days where this course is NOT yet scheduled.
    if (!assignedDays.has(timeSlot.day)) {
      score += 100; // Large bonus to encourage 1-session-per-day spread
    } else {
      score -= 50;  // Real penalty for clustering on the same day, preventing clumps
    }

    // UI EFFICIENCY: Bonus for assigning to the SAME time slot across different days
    // This helps produce the "1 row per course" look in the PDF
    const courseSessions = this.assignedSessions.filter(s => s.courseId === course.id);
    const usesSameTime = courseSessions.some(s => {
      const sSlot = this.timeSlots.find(ts => ts.id === s.timeSlotId);
      return sSlot && sSlot.startTime === timeSlot.startTime && sSlot.endTime === timeSlot.endTime;
    });
    if (usesSameTime) {
      score += 30; // Encourage vertical alignment in the timetable grid
    }

    // Prefer rooms with better capacity match
    const courseEnroll = course.enrolledStudents || course.currentEnrollment || 30;
    const capacityUtilization = courseEnroll / room.capacity;

    if (capacityUtilization >= 0.7 && capacityUtilization <= 0.95) {
      score += 20; // Optimal utilization (70-95%)
    } else if (capacityUtilization >= 0.5 && capacityUtilization < 0.7) {
      score += 10; // Good utilization (50-70%)
    } else if (capacityUtilization > 0.95) {
      score -= 10; // Overcrowded
    } else {
      score += 5; // Underutilized but acceptable
    }

    // Prefer rooms that match course requirements
    if (course.requiresLab && room.type === 'LABORATORY') {
      score += 15;
    }
    if (course.requiresProjector && room.hasProjector) {
      score += 10;
    }
    if (course.requiresComputer && room.hasComputers) {
      score += 10;
    }

    // Add randomness for better distribution (small random bonus -5 to +5)
    score += (Math.random() * 10) - 5;

    // Penalty for back-to-back (if constraint is set)
    if (this.constraints.avoidBackToBack && this.hasBackToBackConflict(instructorId, timeSlot)) {
      score -= 15; // Reduced from 20
    }

    // Prefer balanced instructor load
    const instructorHours = this.instructorHours.get(instructorId) || 0;
    if (instructorHours < 10) {
      score += 10; // Prefer instructors with lighter load
    }

    return score;
  }

  /**
   * Find suitable rooms for a course
   * Returns rooms sorted by suitability (best first)
   */
  private findSuitableRooms(course: any): any[] {
    const courseEnroll = course.enrolledStudents || course.currentEnrollment || 0;
    const courseType = course.type || 'THEORY';

    return this.rooms
      .filter(room => {
        // Check if room is active
        if (room.isActive === false) {
          return false;
        }

        // Check capacity
        if (room.capacity && courseEnroll > 0 && room.capacity < courseEnroll) {
          return false;
        }

        // Check room type compatibility
        if (courseType === 'LAB' || courseType === 'LABORATORY') {
          if (room.type !== 'LABORATORY' && room.type !== 'COMPUTER_LAB') {
            return false;
          }
        }

        // Check equipment requirements
        if (course.requiresProjector && !room.hasProjector) {
          return false;
        }
        if (course.requiresComputer && !room.hasComputers) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        // Sort by capacity match (closer to enrollment is better)
        const aUtil = courseEnroll > 0 ? Math.abs(a.capacity - courseEnroll) : 0;
        const bUtil = courseEnroll > 0 ? Math.abs(b.capacity - courseEnroll) : 0;
        return aUtil - bUtil;
      });
  }

  /**
   * Check if instructor is available at this time slot
   */
  private isInstructorAvailable(
    instructorId: string,
    timeSlot: any,
    availability: any[]
  ): boolean {
    // If no availability records exist, assume instructor is always available
    if (availability.length === 0) {
      return true;
    }

    // Check if instructor has any availability for this day
    const dayAvailability = availability.filter(avail => avail.day === timeSlot.day);

    // If no availability records for this day, check if instructor has ANY availability records
    // If they have some records but not for this day, assume not available for this day
    // BUT: If they have records marked as available for other days, we should check if this day is explicitly blocked
    // For now, if no records for this day, assume available (more permissive)
    if (dayAvailability.length === 0) {
      // More permissive: if instructor has availability records but none for this day,
      // assume they're available (they just haven't set up availability for this day yet)
      return true;
    }

    // Check if any availability window covers this time slot
    return dayAvailability.some(avail => {
      if (avail.isAvailable !== true) {
        return false;
      }

      // Check if time slot fits within availability window
      const slotStart = this.timeToMinutes(timeSlot.startTime);
      const slotEnd = this.timeToMinutes(timeSlot.endTime);
      const availStart = this.timeToMinutes(avail.startTime);
      const availEnd = this.timeToMinutes(avail.endTime);

      // Time slot must be completely within availability window
      return slotStart >= availStart && slotEnd <= availEnd;
    });
  }

  /**
   * Infer program type from slot if missing
   * ENHANCED: Better detection for evening programs
   */
  private inferProgramType(slot: any): string {
    if (!slot) return 'DAY';
    if (slot.programType) return slot.programType;

    const day = slot.day;

    // WEEKEND is Saturday or Sunday
    if (day === 'SATURDAY' || day === 'SUNDAY') return 'WEEKEND';

    // Check time - if start time is 14:00 (2 PM) or later, it's evening
    const startTime = slot.startTime || '';
    const [hourStr] = startTime.split(':');
    const hour = parseInt(hourStr) || 0;

    if (hour >= 17) return 'EVENING';
    if (hour >= 14) return 'EVENING'; // 2 PM onwards is also evening

    return 'DAY';
  }

  /**
   * Check if time is within range
   */
  private isTimeInRange(time: string, start: string, end: string): boolean {
    return time >= start && time <= end;
  }

  /**
   * Check if two time ranges overlap
   */
  private timesOverlap(start1: string, end1: string, start2: string, end2: string): boolean {
    const start1Minutes = this.timeToMinutes(start1);
    const end1Minutes = this.timeToMinutes(end1);
    const start2Minutes = this.timeToMinutes(start2);
    const end2Minutes = this.timeToMinutes(end2);

    return start1Minutes < end2Minutes && start2Minutes < end1Minutes;
  }


  /**
   * Get slot duration in hours
   */
  private getSlotDuration(timeSlot: any): number {
    const [startHour, startMin] = timeSlot.startTime.split(':').map(Number);
    const [endHour, endMin] = timeSlot.endTime.split(':').map(Number);
    const startTotal = startHour * 60 + startMin;
    const endTotal = endHour * 60 + endMin;
    return (endTotal - startTotal) / 60;
  }

  /**
   * Check for back-to-back conflicts
   */
  private hasBackToBackConflict(instructorId: string, timeSlot: any): boolean {
    const bookedSlots = this.instructorBookings.get(instructorId);
    if (!bookedSlots || bookedSlots.size === 0) {
      return false;
    }

    // Get all booked time slots for this instructor
    const bookedTimeSlots = this.timeSlots.filter(ts => bookedSlots.has(ts.id));

    // Check if any booked slot is immediately before or after this slot
    for (const booked of bookedTimeSlots) {
      if (booked.day === timeSlot.day) {
        // Check if times are consecutive
        if (booked.endTime === timeSlot.startTime || booked.startTime === timeSlot.endTime) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Mark resources as booked
   * Each session is a single time slot (not consecutive)
   */
  private markAsBooked(session: TimetableSession): void {
    const slot = this.timeSlots.find(ts => ts.id === session.timeSlotId);
    if (!slot) return;

    // Mark room as booked
    const roomBookings = this.roomBookings.get(session.roomId) || [];
    roomBookings.push({
      timeSlotId: slot.id,
      day: slot.day,
      startTime: slot.startTime,
      endTime: slot.endTime
    });
    this.roomBookings.set(session.roomId, roomBookings);

    // Mark instructor as booked
    const instructorBookings = this.instructorBookings.get(session.instructorId);
    if (instructorBookings) {
      instructorBookings.add(slot.id);
    }

    // Mark this time slot as globally booked for this instructor
    // This prevents instructor double-booking at the same time
    // Note: Different instructors can teach at the same time in the same room
    const timeKey = `${slot.day}-${slot.startTime}-${slot.endTime}-${session.instructorId}`;
    this.globalTimeBookings.add(timeKey);

    // Update instructor hours
    const currentHours = this.instructorHours.get(session.instructorId) || 0;
    const slotDuration = this.getSlotDuration(slot);
    this.instructorHours.set(session.instructorId, currentHours + slotDuration);

    // Track day distribution
    const currentDayCount = this.dayDistribution.get(slot.day) || 0;
    this.dayDistribution.set(slot.day, currentDayCount + 1);

    // STUDENT GROUP BOOKING
    const groupKey = this.getGroupKey(
      this.courses.find(c => c.id === session.courseId),
      !!session.group,
      session.group === 'Group B'
    );
    if (!this.studentGroupBookings.has(groupKey)) {
      this.studentGroupBookings.set(groupKey, new Set());
    }
    this.studentGroupBookings.get(groupKey)!.add(slot.id);
  }

  private getGroupKey(course: any, isSplit: boolean = false, isGroupB: boolean = false): string {
    if (!course) return 'UNKNOWN';
    const program = course.programType || 'DAY';
    const level = course.level || 'L1';
    const intake = course.intake || 'I1';
    const groupSuffix = isSplit ? (isGroupB ? '-B' : '-A') : '';
    return `${program}-${level}-${intake}${groupSuffix}`;
  }

  private checkPrerequisites(course: any, slot: any, groupKey: string): boolean {
    if (!course.prerequisites || course.prerequisites.length === 0) return true;

    // A course cannot clash with its prerequisites for the same intake/group
    const prerequisiteIds = course.prerequisites.map((p: any) => p.prerequisiteId);
    
    // Check if any prerequisite is already scheduled at this exact time for this group
    const clashingPrereq = this.assignedSessions.find(s => {
      const isPrereq = prerequisiteIds.includes(s.courseId);
      if (!isPrereq) return false;
      
      const isSameTime = s.timeSlotId === slot.id;
      if (!isSameTime) return false;

      const sCourse = this.courses.find(c => c.id === s.courseId);
      const sGroupKey = this.getGroupKey(sCourse, !!s.group, s.group === 'Group B');
      return sGroupKey === groupKey;
    });

    if (clashingPrereq) {
      return false;
    }

    return true;
  }

  /**
   * Get generation statistics
   */
  getStatistics(): {
    totalSessions: number;
    coursesAssigned: number;
    conflicts: ConflictInfo[];
    conflictCount: number;
    instructorUtilization: Record<string, number>;
    dayDistribution: Record<string, number>;
    courseSessionsAssigned: Record<string, number>;
  } {
    const coursesAssigned = new Set(this.assignedSessions.map(s => s.courseId)).size;
    const instructorUtilization: Record<string, number> = {};
    const dayDistribution: Record<string, number> = {};
    const courseSessionsAssigned: Record<string, number> = {};

    this.instructorHours.forEach((hours, instructorId) => {
      instructorUtilization[instructorId] = hours;
    });

    this.dayDistribution.forEach((count, day) => {
      dayDistribution[day] = count;
    });

    this.courseSessionsAssigned.forEach((count, courseId) => {
      courseSessionsAssigned[courseId] = count;
    });

    return {
      totalSessions: this.assignedSessions.length,
      coursesAssigned,
      conflicts: this.conflicts,
      conflictCount: this.conflicts.length,
      instructorUtilization,
      dayDistribution,
      courseSessionsAssigned,
    };
  }

  /**
   * Adventist Program Day Constraints
   * DAY/EVENING: Monday-Friday
   * WEEKEND: Saturday (Evening) & Sunday (Full day)
   */
  private isSlotDayAllowedForCourseProgram(course: any, slot: any): boolean {
    const program = course.programType || 'DAY';
    const day = slot.day;

    if (program === 'DAY' || program === 'EVENING') {
      // Must be Monday to Friday
      return ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'].includes(day);
    }

    if (program === 'WEEKEND') {
      // Must be Saturday or Sunday
      if (day === 'SATURDAY') {
        // Only evening for Saturday (Post-Sabbath)
        const hour = parseInt(slot.startTime.split(':')[0]);
        return hour >= 18;
      }
      return day === 'SUNDAY';
    }

    return true;
  }
}

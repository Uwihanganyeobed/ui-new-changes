import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import prisma from '../config/prisma.js';

/**
 * Timetable PDF Generation Utility
 * Generates professional PDF timetables for departments, instructors, and students
 */

export interface TimetablePDFData {
  timetableId: string;
  type: 'department' | 'instructor' | 'student' | 'school';
  startDate?: string;
  endDate?: string;
  customTitle?: string;
}

export interface GeneratedTimetablePDF {
  pdfBuffer: Buffer;
  fileName: string;
  mimeType: string;
}

/**
 * Infer program type from time slot
 * Returns 'DAY', 'EVENING', or 'WEEKEND' based on day and time
 * ENHANCED: Better detection logic
 */
function inferProgramType(slot: any): string {
  if (!slot) return 'DAY';
  if (slot.programType) return slot.programType;

  const day = slot.day;

  // WEEKEND is Saturday or Sunday
  if (day === 'SATURDAY' || day === 'SUNDAY') return 'WEEKEND';

  // Check time - if start time is 17:00 (5 PM) or later, it's evening
  const startTime = slot.startTime || '';
  const [hourStr] = startTime.split(':');
  const hour = parseInt(hourStr) || 0;

  if (hour >= 17) return 'EVENING';
  if (hour >= 14) return 'EVENING'; // 2 PM onwards is also evening

  return 'DAY';
}

/** DAY/EVENING: Mon–Fri only. WEEKEND: Sat–Sun only. */
function getPdfDayColumnsForProgram(program: string): string[] {
  if (program === 'WEEKEND') {
    return ['SATURDAY', 'SUNDAY'];
  }
  return ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
}

/** Full week column order (PDF headers): Sunday → Saturday */
const PDF_ALL_DAYS = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
] as const;

/** Which program section a session belongs in — course.programType wins so EVENING courses list under EVENING. */
function resolveSessionProgramForPdf(session: any): string {
  const fromCourse = session.course?.programType;
  if (fromCourse === 'DAY' || fromCourse === 'EVENING' || fromCourse === 'WEEKEND') {
    return fromCourse;
  }
  if (session.programType) return session.programType;
  if (session.timeSlot) return inferProgramType(session.timeSlot);
  return 'DAY';
}

/** DAY/EVENING: only show cells Mon–Fri. WEEKEND: only Sat–Sun (other columns stay empty). */
function shouldShowPdfDayCell(program: string, day: string): boolean {
  if (program === 'WEEKEND') return day === 'SATURDAY' || day === 'SUNDAY';
  if (program === 'DAY' || program === 'EVENING') {
    return day !== 'SATURDAY' && day !== 'SUNDAY';
  }
  return true;
}

/**
 * Generate timetable PDF
 */
export async function generateTimetablePDF(data: TimetablePDFData): Promise<GeneratedTimetablePDF> {
  const { timetableId, type, customTitle } = data;

  // Fetch timetable data
  const timetable = (await prisma.timetable.findUnique({
    where: { id: timetableId },
    include: {
      department: {
        select: {
          id: true,
          code: true,
          name: true,
          faculty: {
            select: {
              name: true,
            },
          },
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
      sessions: {
        include: {
          course: {
            select: {
              id: true,
              code: true,
              name: true,
              weeklyHours: true,
              type: true,
              programType: true,
              level: true,
              levelClass: true,
              intakeId: true,
              intakeModel: {
                select: {
                  name: true
                }
              },
              department: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  faculty: {
                    select: {
                      name: true,
                    },
                  },
                },
              },
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
            },
          },
          timeSlot: {
            select: {
              id: true,
              day: true,
              startTime: true,
              endTime: true,
              duration: true,
              slotNumber: true,
              programType: true,
            },
          },
        },
        orderBy: [
          { timeSlot: { day: 'asc' } },
          { timeSlot: { startTime: 'asc' } },
        ],
      },
    },
  })) as any;

  if (!timetable) {
    throw new Error('Timetable not found');
  }

  if (timetable.sessions.length === 0) {
    throw new Error('No sessions found for this timetable');
  }

  // Create PDF document
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  // Set document metadata
  doc.setProperties({
    title: `${timetable.name} - Timetable`,
    subject: `Timetable for ${timetable.department.name}`,
    author: 'College Timetable Generator',
    creator: 'College Timetable Generator',
    keywords: `timetable, ${timetable.department.name}, ${timetable.semester.name}`,
  });

  // Generate PDF
  await generateMultiProgramTimetablePDF(doc, timetable, customTitle);

  // Generate filename
  const sanitizedName = timetable.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const fileName = `timetable_${sanitizedName}_${Date.now()}.pdf`;
  const pdfBuffer = Buffer.from(doc.output('arraybuffer'));

  return {
    pdfBuffer,
    fileName,
    mimeType: 'application/pdf',
  };
}

/**
 * Add professional header to timetable PDF
 */
function addTimetableHeader(
  doc: jsPDF,
  title: string,
  department: { code: string; name: string },
  semester: { name: string; type: string; startDate?: Date; endDate?: Date },
  timetable: any
) {
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header background (Clean White as per image)
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageWidth, 40, 'F');

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');

  // Left aligned headers like image
  const facultyName = timetable.department?.faculty?.name || 
                     timetable.sessions?.[0]?.course?.department?.faculty?.name || 
                     'FACULTY OF COMPUTING AND INFORMATION SCIENCES';

  // Left aligned headers like image
  const leftMargin = 10;
  doc.text('CAMPUS: KIGALI', leftMargin, 8);
  doc.text(facultyName.toUpperCase(), leftMargin, 13);
  doc.text('WEEKLY TIMETABLE', leftMargin, 18);

  // Center the main title
  doc.setFontSize(12);
  
  let dateRangeLabel = 'DATES TBD';
  if (timetable.validFrom && timetable.validTo) {
    const startObj = new Date(timetable.validFrom);
    const endObj = new Date(timetable.validTo);
    dateRangeLabel = `${startObj.toLocaleDateString()} TO ${endObj.toLocaleDateString()}`;
  }

  doc.text(`TEACHING TIME TABLE ${dateRangeLabel}`, pageWidth / 2, 30, { align: 'center' });

  // Add Generation Date
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const now = new Date();
  doc.text(`Generated on: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`, pageWidth / 2, 35, { align: 'center' });

  // Border bottom
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.line(leftMargin, 35, pageWidth - leftMargin, 35);

  doc.setTextColor(0, 0, 0);
}


/**
 * Add footer with QR code and verification info
 */
async function addTimetableFooter(
  doc: jsPDF,
  timetableId: string,
  generatedAt: Date
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Footer separator
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(10, pageHeight - 25, pageWidth - 10, pageHeight - 25);

  // Generation info
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text(`Generated: ${generatedAt.toLocaleString()}`, 10, pageHeight - 18);
  doc.text(`Timetable ID: ${timetableId}`, 10, pageHeight - 12);
  doc.text('This is an official timetable document', 10, pageHeight - 6);

  // QR code for verification
  try {
    const qrData = JSON.stringify({
      timetableId,
      generatedAt: generatedAt.toISOString(),
      verificationUrl: `https://timetable-system.com/verify/${timetableId}`,
    });

    const qrDataUrl = await QRCode.toDataURL(qrData, {
      width: 300,
      margin: 1,
      errorCorrectionLevel: 'M',
    });

    doc.addImage(qrDataUrl, 'PNG', pageWidth - 30, pageHeight - 25, 20, 20);
    doc.setFontSize(7);
    doc.text('Scan to verify', pageWidth - 20, pageHeight - 5, { align: 'center' });
  } catch (error) {
    console.error('Failed to generate QR code:', error);
  }

  doc.setTextColor(0, 0, 0);
}

/**
 * Generate department timetable PDF with grid layout (whole school)
 */
async function generateDepartmentTimetablePDF(
  doc: jsPDF,
  timetable: any,
  weekNumber?: number,
  customTitle?: string
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Check if this is a school-level timetable (no department or multiple departments)
  const isSchoolLevel = !timetable.department || !timetable.department.id;

  // Get unique departments from sessions
  const departmentsMap = new Map<string, { id: string; code: string; name: string }>();
  timetable.sessions.forEach((session: any) => {
    if (session.course?.department) {
      const dept = session.course.department;
      if (!departmentsMap.has(dept.id)) {
        departmentsMap.set(dept.id, {
          id: dept.id,
          code: dept.code,
          name: dept.name,
        });
      }
    }
  });

  const departments = Array.from(departmentsMap.values());
  const isMultiDepartment = departments.length > 1;

  console.log('[PDF generateDepartmentTimetablePDF] Detection results:');
  console.log('  - isSchoolLevel:', isSchoolLevel);
  console.log('  - isMultiDepartment:', isMultiDepartment);
  console.log('  - departments count:', departments.length);
  console.log('  - departments:', departments.map(d => d.code).join(', '));

  // If multi-department (Faculty-wide or School-wide), use the grid structure with department columns
  if (isMultiDepartment) {
    console.log('[PDF] Using multi-department layout (detected via isMultiDepartment)');
    await generateSchoolLevelTimetablePDF(doc, timetable, departments, customTitle);
    return;
  }

  // Otherwise, use the existing department-level structure
  console.log('[PDF] Using standard department-level layout');

  // For whole school timetable, use a more generic title
  // Dynamic title based on timetable name or department
  const title = customTitle || timetable.name || (timetable.department
    ? `Department Timetable - ${timetable.department.name}`
    : `School-Wide Timetable - ${timetable.semester.name}`);

  // Use first department as placeholder if none exists (for whole school)
  const departmentForHeader = timetable.department || { code: 'ALL', name: 'All Departments' };
  addTimetableHeader(doc, title, departmentForHeader, timetable.semester, timetable);

  // Day order
  const dayOrder: Record<string, number> = {
    MONDAY: 1,
    TUESDAY: 2,
    WEDNESDAY: 3,
    THURSDAY: 4,
    FRIDAY: 5,
    SATURDAY: 6,
    SUNDAY: 7,
  };

  // Group sessions by day and time
  const sessionsByDay: Record<string, any[]> = {};
  timetable.sessions.forEach((session: any) => {
    const day = session.timeSlot.day;
    if (!sessionsByDay[day]) {
      sessionsByDay[day] = [];
    }
    sessionsByDay[day].push(session);
  });

  // Sort days
  const sortedDays = Object.keys(sessionsByDay).sort((a, b) => {
    return (dayOrder[a] || 99) - (dayOrder[b] || 99);
  });

  // Table setup - IMPROVED SPACING
  const startY = 40;
  const colWidth = (pageWidth - 20) / (sortedDays.length + 1);
  const baseRowHeight = 12; // Increased from 8 to 12 for better spacing
  const courseLineHeight = 5; // Increased from 3 to 5 for better spacing between courses
  const cellPadding = 2; // Padding inside cells
  let currentY = startY;

  // Table header - IMPROVED FONT SIZE
  doc.setFillColor(240, 240, 240);
  doc.rect(10, currentY, pageWidth - 20, baseRowHeight, 'F');
  doc.setFontSize(11); // Increased from 10 to 11
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('Time', 10 + colWidth / 2, currentY + baseRowHeight / 2, { align: 'center', baseline: 'middle' });

  sortedDays.forEach((day, index) => {
    const x = 10 + colWidth * (index + 1);
    doc.text(day.substring(0, 3), x + colWidth / 2, currentY + baseRowHeight / 2, { align: 'center', baseline: 'middle' });
  });

  currentY += baseRowHeight;

  // Get ALL unique time slots from database (8:00 AM to 16:30 PM) including breaks and lunch
  // This ensures the PDF shows the complete day structure with all 12 slots
  const allTimeSlots = await prisma.timeSlot.findMany({
    distinct: ['startTime', 'endTime'],
    orderBy: [
      { startTime: 'asc' },
    ],
  });

  // Create a map of unique time slots (by start-end time, not by day)
  const timeSlotMap = new Map<string, { startTime: string; endTime: string; isBreak: boolean; slotNumber: number }>();

  allTimeSlots.forEach((slot: any) => {
    const key = `${slot.startTime}-${slot.endTime}`;
    if (!timeSlotMap.has(key)) {
      timeSlotMap.set(key, {
        startTime: slot.startTime,
        endTime: slot.endTime,
        isBreak: slot.isBreak || false,
        slotNumber: slot.slotNumber || 0,
      });
    }
  });

  // Sort time slots by start time to maintain order (8:00 to 16:30)
  const sortedTimeSlots = Array.from(timeSlotMap.values()).sort((a, b) => {
    return a.startTime.localeCompare(b.startTime);
  });

  // Helper function to convert time to minutes
  const timeToMinutes = (time: string): number => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };

  // Helper function to check if a course spans multiple consecutive slots
  const getConsecutiveSessions = (session: any, allSessions: any[], day: string): any[] => {
    const courseId = session.course.id;
    const slot = session.timeSlot;
    const consecutive: any[] = [session];

    // Find other sessions of the same course on the same day
    const sameDaySessions = allSessions.filter((s: any) =>
      s.course.id === courseId &&
      s.timeSlot.day === day &&
      s.id !== session.id
    );

    // Sort by start time
    sameDaySessions.sort((a, b) =>
      a.timeSlot.startTime.localeCompare(b.timeSlot.startTime)
    );

    // Check if they are consecutive
    let currentEnd = slot.endTime;
    for (const s of sameDaySessions) {
      const timeDiff = timeToMinutes(s.timeSlot.startTime) - timeToMinutes(currentEnd);
      if (timeDiff >= 0 && timeDiff <= 10) { // Within 10 minutes
        consecutive.push(s);
        currentEnd = s.timeSlot.endTime;
      } else {
        break; // Not consecutive anymore
      }
    }

    return consecutive;
  };

  // Draw table rows for all time slots (8:00 AM to 16:30 PM)
  sortedTimeSlots.forEach((timeSlot) => {
    // Calculate max sessions in this time slot across all days
    // Also account for courses that span multiple slots
    let maxSessionsInRow = 1;
    const processedCourses = new Set<string>();

    sortedDays.forEach((day) => {
      const daySessions = timetable.sessions.filter((s: any) =>
        s.timeSlot.day === day &&
        s.timeSlot.startTime === timeSlot.startTime &&
        s.timeSlot.endTime === timeSlot.endTime
      );

      // Check for consecutive multi-hour courses
      daySessions.forEach((session: any) => {
        if (!processedCourses.has(session.course.id)) {
          const consecutive = getConsecutiveSessions(session, timetable.sessions, day);
          if (consecutive.length > maxSessionsInRow) {
            maxSessionsInRow = consecutive.length;
          }
          processedCourses.add(session.course.id);
        }
      });

      if (daySessions.length > maxSessionsInRow) {
        maxSessionsInRow = daySessions.length;
      }
    });

    // Calculate row height - break/lunch slots are shorter
    // IMPROVED: Increased base height and spacing for better readability
    let rowHeight = baseRowHeight;
    if (!timeSlot.isBreak) {
      // Add extra height for multiple courses + padding
      const extraHeight = maxSessionsInRow > 1
        ? (maxSessionsInRow - 1) * courseLineHeight + (cellPadding * 2)
        : cellPadding;
      rowHeight = baseRowHeight + extraHeight;
    }

    // Check if we need a new page
    if (currentY + rowHeight > pageHeight - 40) {
      doc.addPage();
      addTimetableHeader(doc, title, timetable.department, timetable.semester, timetable);
      currentY = startY;
    }

    // Draw row background (different color for break/lunch slots)
    if (timeSlot.isBreak) {
      // Break/Lunch slots - light orange/yellow background
      doc.setFillColor(255, 245, 200); // Light yellow for breaks/lunch
    } else {
      // Regular class slots - white background
      doc.setFillColor(255, 255, 255);
    }
    doc.rect(10, currentY, pageWidth - 20, rowHeight);

    // Draw time column - IMPROVED FONT SIZE
    doc.setFontSize(10); // Increased from 9 to 10
    if (timeSlot.isBreak) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(200, 100, 0); // Orange text for breaks
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
    }

    const timeLabel = `${timeSlot.startTime} - ${timeSlot.endTime}`;
    const breakLabel = timeSlot.isBreak ? (timeSlot.startTime === '10:55' ? ' (BREAK)' : ' (LUNCH)') : '';
    doc.text(timeLabel + breakLabel, 10 + colWidth / 2, currentY + rowHeight / 2, { align: 'center', baseline: 'middle' });

    // Draw day columns
    sortedDays.forEach((day, dayIndex) => {
      const x = 10 + colWidth * (dayIndex + 1);
      const daySessions = timetable.sessions.filter((s: any) =>
        s.timeSlot.day === day &&
        s.timeSlot.startTime === timeSlot.startTime &&
        s.timeSlot.endTime === timeSlot.endTime
      );

      // Draw cell border
      doc.setDrawColor(180, 180, 180);
      doc.setLineWidth(0.3);
      doc.rect(x, currentY, colWidth, rowHeight);

      // Only show courses in non-break slots
      if (!timeSlot.isBreak && daySessions.length > 0) {
        // Group sessions by course (to handle multi-hour courses spanning multiple slots)
        const sessionsByCourse = new Map<string, any[]>();
        daySessions.forEach((session: any) => {
          const courseId = session.course.id;
          if (!sessionsByCourse.has(courseId)) {
            sessionsByCourse.set(courseId, []);
          }
          sessionsByCourse.get(courseId)!.push(session);
        });

        let sessionIndex = 0;
        sessionsByCourse.forEach((courseSessions) => {
          const session = courseSessions[0]; // Use first session for display
          // IMPROVED: Better vertical spacing with padding
          const sessionY = currentY + cellPadding + 2 + (sessionIndex * courseLineHeight);

          // Course code (bold, larger) - INCREASED FONT SIZE
          doc.setFontSize(10); // Increased from 8 to 10
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(0, 0, 0);
          const groupLabel = session.group ? ` (${session.group})` : '';
          const intakeLabel = session.course?.intake?.name ? ` [${session.course.intake.name}]` : '';
          doc.text(session.course.name + groupLabel + intakeLabel, x + cellPadding + 2, sessionY, {
            maxWidth: colWidth - (cellPadding * 2) - 4
          });

          // If course spans multiple slots, show indicator
          if (courseSessions.length > 1) {
            doc.setFontSize(7); // Increased from 6 to 7
            doc.setTextColor(100, 100, 100);
            doc.text(`(${courseSessions.length}h)`, x + colWidth - cellPadding - 6, sessionY);
          }

          // Department code (below course code) - INCREASED FONT SIZE AND SPACING
          doc.setFontSize(7); // Increased from 5 to 7
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(80, 80, 80);
          if (session.course.department) {
            doc.text(session.course.department.code || '', x + cellPadding + 2, sessionY + 2.5);
          }

          // Room (below department) - INCREASED FONT SIZE AND SPACING
          doc.setFontSize(8); // Increased from 6 to 8
          doc.setTextColor(50, 50, 50);
          const roomText = session.room.building && session.room.number
            ? `${session.room.building}-${session.room.number}`
            : session.room.number || '';
          doc.text(roomText, x + cellPadding + 2, sessionY + 4.5);

          // Instructor code/name (at bottom) - INCREASED FONT SIZE AND SPACING
          if (session.instructor) {
            doc.setFontSize(7); // Increased from 5 to 7
            doc.setTextColor(100, 100, 100);
            if (session.instructor.user) {
              const firstInitial = session.instructor.user.firstName?.[0] || '';
              const lastName = session.instructor.user.lastName || '';
              const instructorName = firstInitial && lastName ? `${firstInitial}. ${lastName}` : (session.instructor.employeeId || '');
              doc.text(instructorName, x + cellPadding + 2, sessionY + 6.5);
            } else if (session.instructor.employeeId) {
              doc.text(session.instructor.employeeId.substring(0, 4), x + cellPadding + 2, sessionY + 6.5);
            }
          }

          sessionIndex++;
        });
      }
    });

    currentY += rowHeight;
  });

  // Add footer
  await addTimetableFooter(doc, timetable.id, new Date());
}

/**
 * Generate school-level timetable PDF with department columns
 * Structure: Day | Hours | Dept1 | Dept2 | Dept3 | ... | DeptN
 */
async function generateSchoolLevelTimetablePDF(
  doc: jsPDF,
  timetable: any,
  departments: Array<{ id: string; code: string; name: string }>,
  customTitle?: string
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  console.log('[PDF generateSchoolLevelTimetablePDF] Starting generation');
  console.log('  - Timetable type:', timetable.name);
  console.log('  - Departments count:', departments.length);
  console.log('  - Departments:', departments.map(d => `${d.code} (${d.name})`).join(', '));
  console.log('  - Total sessions fetched from database:', timetable.sessions.length);

  // Count sessions per department
  const sessionsPerDept = new Map<string, number>();
  timetable.sessions.forEach((session: any) => {
    const deptId = session.course?.department?.id;
    if (deptId) {
      sessionsPerDept.set(deptId, (sessionsPerDept.get(deptId) || 0) + 1);
    }
  });
  console.log('  - Sessions per department:');
  departments.forEach(dept => {
    const count = sessionsPerDept.get(dept.id) || 0;
    console.log(`    ${dept.code}: ${count} sessions`);
  });

  const title = customTitle || timetable.name || `School-Wide Timetable - ${timetable.semester.name}`;
  const departmentForHeader = { code: 'ALL', name: 'All Departments' };
  addTimetableHeader(doc, title, departmentForHeader, timetable.semester, timetable);

  // Day order
  const dayOrder: Record<string, number> = {
    MONDAY: 1,
    TUESDAY: 2,
    WEDNESDAY: 3,
    THURSDAY: 4,
    FRIDAY: 5,
    SATURDAY: 6,
    SUNDAY: 7,
  };

  // Get all unique time slots (sorted by start time)
  const allTimeSlots = await prisma.timeSlot.findMany({
    where: { isActive: true },
    distinct: ['startTime', 'endTime'],
    orderBy: [{ startTime: 'asc' }],
  });

  const timeSlotMap = new Map<string, { startTime: string; endTime: string; isBreak: boolean }>();
  allTimeSlots.forEach((slot: any) => {
    const key = `${slot.startTime}-${slot.endTime}`;
    if (!timeSlotMap.has(key)) {
      timeSlotMap.set(key, {
        startTime: slot.startTime,
        endTime: slot.endTime,
        isBreak: slot.isBreak || false,
      });
    }
  });

  const sortedTimeSlots = Array.from(timeSlotMap.values()).sort((a, b) =>
    a.startTime.localeCompare(b.startTime)
  );

  console.log(`[PDF] Total time slots to display: ${sortedTimeSlots.length}`);

  // Table setup - IMPROVED SPACING with MINIMUM COLUMN WIDTH
  const startY = 40;
  const dayColWidth = 25; // Day column width
  const hoursColWidth = 35; // Hours column width
  const minDeptColWidth = 40; // MINIMUM department column width (40mm for readability)

  // Calculate department column width with minimum constraint
  const availableWidth = pageWidth - 20 - dayColWidth - hoursColWidth;
  let deptColWidth = availableWidth / departments.length;

  // Enforce minimum column width
  if (deptColWidth < minDeptColWidth) {
    console.log(`[PDF] WARNING: Too many departments (${departments.length}). Column width would be ${deptColWidth.toFixed(1)}mm.`);
    console.log(`[PDF] Enforcing minimum width of ${minDeptColWidth}mm. Content may extend beyond page width.`);
    deptColWidth = minDeptColWidth;
  }

  console.log(`[PDF] Column widths: Day=${dayColWidth}mm, Hours=${hoursColWidth}mm, Dept=${deptColWidth.toFixed(1)}mm`);

  const baseRowHeight = 14; // Increased row height
  const cellPadding = 3; // Padding inside cells
  let currentY = startY;

  // Table header
  doc.setFillColor(240, 240, 240);
  doc.rect(10, currentY, pageWidth - 20, baseRowHeight, 'F');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);

  // Day header
  doc.text('Day', 10 + dayColWidth / 2, currentY + baseRowHeight / 2, { align: 'center', baseline: 'middle' });

  // Hours header
  doc.text('Hours', 10 + dayColWidth + hoursColWidth / 2, currentY + baseRowHeight / 2, { align: 'center', baseline: 'middle' });

  // Department headers
  departments.forEach((dept, index) => {
    const x = 10 + dayColWidth + hoursColWidth + (index * deptColWidth);
    doc.text(dept.code, x + deptColWidth / 2, currentY + baseRowHeight / 2, { align: 'center', baseline: 'middle' });
  });

  currentY += baseRowHeight;

  // Group sessions by day, time slot, and department
  const sessionsByDayTimeDept = new Map<string, Map<string, any[]>>();

  timetable.sessions.forEach((session: any) => {
    const day = session.timeSlot.day;
    const timeKey = `${session.timeSlot.startTime}-${session.timeSlot.endTime}`;

    if (!sessionsByDayTimeDept.has(day)) {
      sessionsByDayTimeDept.set(day, new Map());
    }

    const dayMap = sessionsByDayTimeDept.get(day)!;
    if (!dayMap.has(timeKey)) {
      dayMap.set(timeKey, []);
    }

    dayMap.get(timeKey)!.push(session);
  });

  // Get all days that should be shown (Monday-Friday)
  const allDays = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];

  console.log('[PDF] Rendering days and time slots...');
  console.log('[PDF] Each day will be on a separate page');

  // Draw rows for each day and ALL time slots - ONE DAY PER PAGE
  allDays.forEach((day, dayIdx) => {
    console.log(`[PDF] Processing ${day} (${dayIdx + 1}/5)...`);

    // Start a new page for each day (except the first day)
    if (dayIdx > 0) {
      doc.addPage();
      addTimetableHeader(doc, title, departmentForHeader, timetable.semester, timetable);
      currentY = startY;

      // Re-draw table header on new page
      doc.setFillColor(240, 240, 240);
      doc.rect(10, currentY, pageWidth - 20, baseRowHeight, 'F');
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);

      // Day header
      doc.text('Day', 10 + dayColWidth / 2, currentY + baseRowHeight / 2, { align: 'center', baseline: 'middle' });

      // Hours header
      doc.text('Hours', 10 + dayColWidth + hoursColWidth / 2, currentY + baseRowHeight / 2, { align: 'center', baseline: 'middle' });

      // Department headers
      departments.forEach((dept, index) => {
        const x = 10 + dayColWidth + hoursColWidth + (index * deptColWidth);
        doc.text(dept.code, x + deptColWidth / 2, currentY + baseRowHeight / 2, { align: 'center', baseline: 'middle' });
      });

      currentY += baseRowHeight;
    }

    const daySessions = sessionsByDayTimeDept.get(day) || new Map<string, any[]>();

    // Count sessions for this day
    let daySessionCount = 0;
    daySessions.forEach(sessions => daySessionCount += sessions.length);
    console.log(`  - Total sessions for ${day}: ${daySessionCount}`);

    // Log which timeslots have sessions
    console.log(`  - Timeslots with sessions on ${day}:`);
    daySessions.forEach((sessions, timeKey) => {
      console.log(`    ${timeKey}: ${sessions.length} sessions (${sessions.map((s: any) => s.course.code).join(', ')})`);
    });

    // Calculate total height for this day (for centering day label)
    // Use ALL time slots, not just ones with sessions
    let dayTotalHeight = 0;
    sortedTimeSlots.forEach((slot) => {
      dayTotalHeight += slot.isBreak ? baseRowHeight * 0.7 : baseRowHeight;
    });

    const dayStartY = currentY; // Remember where this day starts

    // Iterate through ALL time slots for this day (not just ones with sessions)
    sortedTimeSlots.forEach((timeSlot, timeIndex) => {
      const timeKey = `${timeSlot.startTime}-${timeSlot.endTime}`;
      const isBreak = timeSlot.isBreak || false;

      // Get sessions for this time slot (if any)
      const timeSlotSessions = daySessions.get(timeKey) || [];

      // Calculate row height - fixed for single course per cell
      let rowHeight = baseRowHeight;
      if (isBreak) {
        rowHeight = baseRowHeight * 0.7; // Smaller for breaks
      }

      // Check if we need a new page
      if (currentY + rowHeight > pageHeight - 40) {
        doc.addPage();
        addTimetableHeader(doc, title, departmentForHeader, timetable.semester, timetable);
        currentY = startY;
      }

      // Draw row background
      if (isBreak) {
        doc.setFillColor(255, 245, 200);
      } else {
        doc.setFillColor(255, 255, 255);
      }
      doc.rect(10, currentY, pageWidth - 20, rowHeight);

      // Draw Day column (only on first time slot of each day, centered vertically)
      // Also draw border for day column spanning all rows
      if (timeIndex === 0) {
        // Draw day column background spanning all rows for this day
        doc.setFillColor(245, 245, 245);
        doc.rect(10, dayStartY, dayColWidth, dayTotalHeight, 'F');

        // Draw day text centered vertically
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        const dayShort = day.substring(0, 3).toUpperCase();
        const dayCenterY = dayStartY + (dayTotalHeight / 2);
        doc.text(dayShort, 10 + dayColWidth / 2, dayCenterY, {
          align: 'center',
          baseline: 'middle'
        });

        // Draw border around day column
        doc.setDrawColor(180, 180, 180);
        doc.setLineWidth(0.5);
        doc.rect(10, dayStartY, dayColWidth, dayTotalHeight);
      }

      // Draw Hours column
      doc.setDrawColor(180, 180, 180);
      doc.setLineWidth(0.3);
      doc.rect(10 + dayColWidth, currentY, hoursColWidth, rowHeight);

      doc.setFontSize(10); // Increased from 9 to 10 for better readability
      if (isBreak) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(200, 100, 0);
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0);
      }
      const timeLabel = `${timeSlot.startTime}-${timeSlot.endTime}`;
      doc.text(timeLabel, 10 + dayColWidth + hoursColWidth / 2, currentY + rowHeight / 2, {
        align: 'center',
        baseline: 'middle'
      });

      // Handle break/lunch slots - merge across all department columns
      if (isBreak) {
        // Draw merged cell across all department columns
        const breakStartX = 10 + dayColWidth + hoursColWidth;
        const breakWidth = deptColWidth * departments.length;
        doc.setDrawColor(200, 150, 0);
        doc.setLineWidth(0.5);
        doc.rect(breakStartX, currentY, breakWidth, rowHeight);

        // Draw break text centered across all departments
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(200, 100, 0);
        const breakText = timeSlot.startTime === '10:55' ? 'BREAK TIME' : 'LUNCH TIME';
        doc.text(breakText, breakStartX + breakWidth / 2, currentY + rowHeight / 2, {
          align: 'center',
          baseline: 'middle'
        });
      } else {
        // Draw Department columns for regular time slots
        departments.forEach((dept, deptIndex) => {
          const x = 10 + dayColWidth + hoursColWidth + (deptIndex * deptColWidth);

          // Draw cell border
          doc.setDrawColor(180, 180, 180);
          doc.setLineWidth(0.3);
          doc.rect(x, currentY, deptColWidth, rowHeight);

          // Get courses for this department and time slot
          const deptSessions = timeSlotSessions.filter((s: any) =>
            s.course?.department?.id === dept.id
          );

          // Show the first course (there should ideally be only one per department per time slot)
          if (deptSessions.length > 0) {
            const session = deptSessions[0];
            const cellY = currentY + cellPadding + 2;

            // Warn if there are multiple sessions (scheduling conflict)
            if (deptSessions.length > 1) {
              console.warn(`[PDF] WARNING: ${deptSessions.length} courses scheduled for ${dept.code} at ${timeSlot.startTime}-${timeSlot.endTime} on ${day}`);
            }

            // Course name - LARGER FONT
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(0, 0, 0);
            const groupLabel = session.group ? ` (${session.group})` : '';
            doc.text(session.course.name + groupLabel, x + cellPadding, cellY, {
              maxWidth: deptColWidth - (cellPadding * 2)
            });

            // Room - BELOW course code
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(50, 50, 50);
            const roomText = session.room.building && session.room.number
              ? `${session.room.building}-${session.room.number}`
              : session.room.number || '';
            doc.text(roomText, x + cellPadding, cellY + 3.5);

            // Instructor initials - BELOW room
            if (session.instructor) {
              doc.setFontSize(7);
              doc.setTextColor(100, 100, 100);
              if (session.instructor.user) {
                const firstInitial = session.instructor.user.firstName?.[0] || '';
                const lastName = session.instructor.user.lastName || '';
                const instructorName = firstInitial && lastName ? `${firstInitial}. ${lastName}` : (session.instructor.employeeId || '');
                doc.text(instructorName, x + cellPadding, cellY + 6.5);
              } else if (session.instructor.employeeId) {
                doc.text(session.instructor.employeeId.substring(0, 4), x + cellPadding, cellY + 6.5);
              }
            }
          }
          // If no courses for this department at this time, cell remains empty
        });
      }

      currentY += rowHeight;
    });
  });

  // Add footer
  await addTimetableFooter(doc, timetable.id, new Date());
}

/**
 * Generate instructor timetable PDF
 */
async function generateInstructorTimetablePDF(
  doc: jsPDF,
  timetable: any,
  customTitle?: string
) {
  // Similar to department but filtered for specific instructor
  // Implementation similar to department timetable
  await generateDepartmentTimetablePDF(doc, timetable, undefined, customTitle || 'Instructor Timetable');
}

/**
 * Generate student timetable PDF
 */
async function generateStudentTimetablePDF(
  doc: jsPDF,
  timetable: any,
  customTitle?: string
) {
  // Similar to department but filtered for student's enrolled courses
  // Implementation similar to department timetable
  await generateDepartmentTimetablePDF(doc, timetable, undefined, customTitle || 'My Timetable');
}

/**
 * Generate simplified weekly timetable view
 */
export async function generateWeeklyTimetablePDF(
  timetableId: string,
  weekNumber: number,
  userId?: string
): Promise<GeneratedTimetablePDF> {
  return generateTimetablePDF({
    timetableId,
    type: 'department',
  });
}

/**
 * Generate multi-program grouped timetable PDF
 * Sections: DAY, EVENING, WEEKEND
 * Layout: Classes (Rows) vs Days (Columns)
 * ENHANCED: Ensures all programs are displayed with maximum content utilization
 */
async function generateMultiProgramTimetablePDF(
  doc: jsPDF,
  timetable: any,
  customTitle?: string
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;
  const contentWidth = pageWidth - (margin * 2);

  // Add main header at the very top
  const title = customTitle || `${timetable.department?.name || 'School-Wide'} Timetable - ${timetable.semester.name}`;
  addTimetableHeader(doc, title, timetable.department || { code: 'ALL', name: 'All Departments' }, timetable.semester, timetable);

  // Group sessions by program type
  const sessionsByProgram: Record<string, any[]> = {
    DAY: [],
    EVENING: [],
    WEEKEND: [],
  };

  timetable.sessions.forEach((session: any) => {
    const pt = resolveSessionProgramForPdf(session);

    if (sessionsByProgram[pt]) {
      sessionsByProgram[pt].push(session);
    } else {
      sessionsByProgram['DAY'].push(session);
    }
  });

  // CRITICAL: Log program distribution
  console.log('[PDF] Program distribution:');
  console.log(`  - DAY: ${sessionsByProgram.DAY.length} sessions`);
  console.log(`  - EVENING: ${sessionsByProgram.EVENING.length} sessions`);
  console.log(`  - WEEKEND: ${sessionsByProgram.WEEKEND.length} sessions`);

  const programs = ['DAY', 'EVENING', 'WEEKEND'];
  let currentY = 40;
  let pageCount = 1;

  for (const program of programs) {
    const programSessions = sessionsByProgram[program];

    console.log(`[PDF] Processing ${program} program with ${programSessions.length} sessions...`);

    // NEW PAGE for each program section (better space utilization)
    if (pageCount > 1) {
      doc.addPage();
      currentY = 20;
    }

    // Program Header with stats
    doc.setFillColor(0, 47, 108);
    doc.rect(margin, currentY, contentWidth, 15, 'F');
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(`${program} PROGRAM`, pageWidth / 2, currentY + 6, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`Total Sessions: ${programSessions.length}`, pageWidth / 2, currentY + 12, { align: 'center' });
    currentY += 18;

    // If no sessions for this program, show empty state
    if (programSessions.length === 0) {
      doc.setFillColor(240, 240, 240);
      doc.rect(margin, currentY, contentWidth, 20, 'F');
      doc.setFontSize(11);
      doc.setTextColor(150, 150, 150);
      doc.setFont('helvetica', 'italic');
      doc.text('No sessions scheduled for this program', pageWidth / 2, currentY + 10, { align: 'center' });
      currentY += 25;
      pageCount++;
      continue;
    }

    // Group sessions by "Class + Course" only
    // This guarantees 1 course = 1 PDF row regardless of time slots or session count
    const sessionsByClass = new Map<string, any[]>();
    programSessions.forEach(session => {
      const levelName = session.course.levelClass?.name || session.course.level || 'Unknown Level';
      const groupLabel = session.group ? ` [${session.group}]` : '';
      
      const classKey = `${levelName}|${session.course.id}${groupLabel}`;

      if (!sessionsByClass.has(classKey)) {
        sessionsByClass.set(classKey, []);
      }
      sessionsByClass.get(classKey)!.push(session);
    });

    // Table Header (with Instructor column)
    const colWidths = {
      teachingMo: 20, // Increased for better fit
      time: 25,
      hour: 12, // Increased for better fit
      class: 40, // Increased for better fit
      intake: 15,
      section: 15, // Increased for better fit
    };

    const dayColumns = PDF_ALL_DAYS; // Always show full week Sunday-Saturday
    const fixedColsWidth = colWidths.teachingMo + colWidths.time + colWidths.hour + colWidths.class + colWidths.intake + colWidths.section;
    const dayColWidth = (contentWidth - fixedColsWidth) / dayColumns.length;

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.setFillColor(0, 47, 108);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);

    const headers = [
      'Teaching mode',
      'Time',
      'Hours',
      'Class',
      'Intake',
      'Section',
      ...dayColumns.map((d) => d.substring(0, 3)),
    ];
    const hWidths = [
      colWidths.teachingMo,
      colWidths.time,
      colWidths.hour,
      colWidths.class,
      colWidths.intake,
      colWidths.section,
      ...Array(dayColumns.length).fill(dayColWidth),
    ];

    const drawProgramTableHeader = (y: number) => {
      let hx = margin;
      headers.forEach((h, i) => {
        doc.setFillColor(255, 255, 255);
        doc.rect(hx, y, hWidths[i], 8, 'S');
        doc.setFontSize(7);
        doc.setTextColor(0, 0, 0);
        doc.text(h, hx + hWidths[i] / 2, y + 4, { align: 'center', baseline: 'middle' });
        hx += hWidths[i];
      });
    };

    drawProgramTableHeader(currentY);
    currentY += 8;

    // Table Rows
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);

    Array.from(sessionsByClass.entries()).forEach(([classKey, classSessions]) => {
      // Find a representative session for row metrics
      const firstSession = classSessions[0];
      const timeSlot = firstSession.timeSlot;

      const rowHeight = 14; // Increased from 12

      // Check for new page
      if (currentY + rowHeight > pageHeight - 25) {
        doc.addPage();
        currentY = 20;

        drawProgramTableHeader(currentY);
        currentY += 8;
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'normal');
      }

      let rx = margin;

      // Draw standard columns
      doc.rect(rx, currentY, colWidths.teachingMo, rowHeight);
      doc.setFontSize(7);
      doc.text('Face to face', rx + colWidths.teachingMo / 2, currentY + rowHeight / 2, { align: 'center', baseline: 'middle' });
      rx += colWidths.teachingMo;

      doc.rect(rx, currentY, colWidths.time, rowHeight);
      let timeText = '';
      const normProgram = (program || '').toUpperCase().trim();
      if (normProgram === 'DAY' || normProgram === 'EVENING') {
        timeText = normProgram === 'DAY' ? '08:00 a.m - 02:00 p.m' : '05:30 p.m - 09:30 p.m';
      } else if (normProgram === 'WEEKEND') {
        timeText = '08:00 a.m - 05:30 p.m'; // Sunday full day / Saturday evening range
      } else {
        timeText = '08:00 a.m - 02:00 p.m'; // Default fallback
      }
      doc.text(timeText, rx + colWidths.time / 2, currentY + rowHeight / 2, { align: 'center', baseline: 'middle' });
      rx += colWidths.time;

      doc.rect(rx, currentY, colWidths.hour, rowHeight);
      const hourText = firstSession.course.weeklyHours ? `${firstSession.course.weeklyHours} Hrs` : '-';
      doc.text(hourText, rx + colWidths.hour / 2, currentY + rowHeight / 2, { align: 'center', baseline: 'middle' });
      rx += colWidths.hour;

      doc.rect(rx, currentY, colWidths.class, rowHeight);
      doc.setFontSize(6);
      const levelName = firstSession.course.levelClass?.name || firstSession.course.level || 'Unknown Level';
      const groupLabel = firstSession.group ? ` (${firstSession.group})` : '';
      const deptLabel = firstSession.course.department?.code || firstSession.course.department?.name || "";
      const displayClass = `${levelName} | ${deptLabel}${groupLabel}`;
      doc.text(displayClass, rx + 2, currentY + 5, { maxWidth: colWidths.class - 4 });
      rx += colWidths.class;

      doc.rect(rx, currentY, colWidths.intake, rowHeight);
      doc.setFontSize(7);
      const intakeLabel =
        firstSession.course.intakeModel?.name ?? firstSession.course.intake ?? '';
      doc.text(intakeLabel, rx + colWidths.intake / 2, currentY + rowHeight / 2, { align: 'center' });
      rx += colWidths.intake;

      doc.rect(rx, currentY, colWidths.section, rowHeight);
      doc.text(program, rx + colWidths.section / 2, currentY + rowHeight / 2, { align: 'center' });
      rx += colWidths.section;

      // Draw Day columns (SUN-SAT) - Fill ALL program days
      dayColumns.forEach(day => {
        doc.rect(rx, currentY, dayColWidth, rowHeight);
        
        // Populate if this day matches the program's defined active days
        if (shouldShowPdfDayCell(program, day)) {
          const courseName = firstSession.course.name || '';
          let instructorLabel = '';
          
          // Use the instructor of the first session as representative
          if (firstSession.instructor?.user) {
            const first = firstSession.instructor.user.firstName?.[0] || '';
            const last = firstSession.instructor.user.lastName || '';
            instructorLabel = first && last ? `${first}. ${last}` : last || firstSession.instructor.employeeId || '';
          }

          // Compact display: Course Name (Bold) + Instructor (Italic/Smaller)
          doc.setFontSize(5.5);
          doc.setFont('helvetica', 'bold');
          const verticalOffset = instructorLabel ? 5 : 7;
          doc.text(courseName, rx + dayColWidth / 2, currentY + verticalOffset, { 
            align: 'center', 
            maxWidth: dayColWidth - 2 
          });

          if (instructorLabel) {
            doc.setFontSize(5);
            doc.setFont('helvetica', 'italic');
            doc.setTextColor(80, 80, 80);
            doc.text(instructorLabel, rx + dayColWidth / 2, currentY + 10, { 
              align: 'center', 
              maxWidth: dayColWidth - 4 
            });
            doc.setTextColor(0, 0, 0);
          }
        }
        rx += dayColWidth;
      });

      currentY += rowHeight;
    });

    currentY += 5; // Space between programs
    pageCount++;
  }

  // Add footer
  
  await addTimetableFooter(doc, timetable.id, new Date());
}

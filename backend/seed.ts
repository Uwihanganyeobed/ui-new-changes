import { PrismaClient, RoleType, DayOfWeek, SemesterType, ProgramType, CourseType } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DAYS = [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY, DayOfWeek.SATURDAY, DayOfWeek.SUNDAY];

// UNILAK Faculties and Departments
const FACULTIES = [
  { name: 'Computing and Information Sciences', code: 'CIS', description: 'Faculty covering software, IT, and information systems' },
  { name: 'Law',                                code: 'LAW', description: 'Faculty of Law — jurisprudence and legal studies' },
  { name: 'Economic Sciences and Management',  code: 'ESM', description: 'Faculty of Economics and Business Management' },
  { name: 'Environmental Studies',              code: 'ENV', description: 'Faculty of Environmental and Rural Development Studies' },
];

// Departments mapped to faculties
const DEPARTMENTS_BY_FACULTY: Record<string, { code: string; name: string }[]> = {
  CIS: [
    { code: 'SE',   name: 'Software Engineering' },
    { code: 'ISM',  name: 'Information Systems Management' },
    { code: 'ITN',  name: 'IT Networking' },
    { code: 'ITM',  name: 'IT Multimedia' },
  ],
  LAW: [
    { code: 'LAW',  name: 'Law' },
  ],
  ESM: [
    { code: 'ACC',  name: 'Accounting' },
  ],
  ENV: [
    { code: 'RD',   name: 'Rural Development' },
  ],
};

// Lecturers per department (5 per dept)
const DEPT_LECTURERS: Record<string, { firstName: string; lastName: string; title: string }[]> = {
  SE: [
    { firstName: 'Jean-Paul', lastName: 'Uwimana',    title: 'Dr.' },
    { firstName: 'Marie',     lastName: 'Mukamana',   title: 'Prof.' },
    { firstName: 'Emmanuel', lastName: 'Habimana',   title: 'Mr.' },
    { firstName: 'Claudine', lastName: 'Nkurunziza', title: 'Dr.' },
    { firstName: 'Patrick',  lastName: 'Bizimana',   title: 'Mr.' },
  ],
  ISM: [
    { firstName: 'Alphonse', lastName: 'Gakuru',    title: 'Dr.' },
    { firstName: 'Beatrice', lastName: 'Gasana',    title: 'Ms.' },
    { firstName: 'Pierre',  lastName: 'Karekezi',   title: 'Prof.' },
    { firstName: 'Rose',    lastName: 'Muhire',     title: 'Mrs.' },
    { firstName: 'Olivier', lastName: 'Niyonkuru',  title: 'Mr.' },
  ],
  ITN: [
    { firstName: 'Maurice', lastName: 'Shyaka',     title: 'Dr.' },
    { firstName: 'Josianne',lastName: 'Rugero',     title: 'Ms.' },
    { firstName: 'Claude',  lastName: 'Kayiranga',  title: 'Mr.' },
    { firstName: 'Denise',  lastName: 'Manzi',      title: 'Dr.' },
    { firstName: 'Fidele',  lastName: 'Ngoga',      title: 'Mr.' },
  ],
  ITM: [
    { firstName: 'Grace',   lastName: 'Iradukunda', title: 'Ms.' },
    { firstName: 'Samuel',  lastName: 'Makuza',     title: 'Mr.' },
    { firstName: 'Julienne',lastName: 'Uwamaliya',  title: 'Dr.' },
    { firstName: 'Xavier',  lastName: 'Rubayiza',   title: 'Prof.' },
    { firstName: 'Yvonne',  lastName: 'Nkusi',      title: 'Mrs.' },
  ],
  LAW: [
    { firstName: 'Charles',   lastName: 'Gatera',        title: 'Prof.' },
    { firstName: 'Immaculee', lastName: 'Rutayisire',    title: 'Dr.' },
    { firstName: 'Justin',    lastName: 'Uwineza',       title: 'Mr.' },
    { firstName: 'Sylvie',    lastName: 'Kayitesi',      title: 'Ms.' },
    { firstName: 'Augustin',  lastName: 'Munyaneza',     title: 'Dr.' },
  ],
  ACC: [
    { firstName: 'Florent',  lastName: 'Bimenyimana',  title: 'Dr.' },
    { firstName: 'Odette',   lastName: 'Nsabimana',    title: 'Ms.' },
    { firstName: 'Gerard',   lastName: 'Kabayiza',     title: 'Mr.' },
    { firstName: 'Solange',  lastName: 'Gasasira',     title: 'Dr.' },
    { firstName: 'Celestin', lastName: 'Uwimana',      title: 'Prof.' },
  ],
  RD: [
    { firstName: 'Antoinette', lastName: 'Mukamurenzi', title: 'Dr.' },
    { firstName: 'Thomas',     lastName: 'Habyarimana', title: 'Mr.' },
    { firstName: 'Jeannette',  lastName: 'Mukandoli',   title: 'Ms.' },
    { firstName: 'Felix',      lastName: 'Nzabonimpa',  title: 'Dr.' },
    { firstName: 'Agnes',      lastName: 'Umubyeyi',    title: 'Mrs.' },
  ],
};

// UNILAK core courses per department with prerequisite examples
const COURSES_BY_DEPT: Record<string, { code: string; name: string; credits: number; weeklyHours: number; isPrereq?: boolean; prereqKey?: string; year?: string }[]> = {
  SE: [
    { code: 'SE101', name: 'Introduction to Programming',       credits: 3, weeklyHours: 4, isPrereq: true, year: 'Y1' },
    { code: 'SE201', name: 'Data Structures and Algorithms',    credits: 3, weeklyHours: 4, prereqKey: 'SE101', year: 'Y2' },
    { code: 'SE202', name: 'Database Management Systems',       credits: 3, weeklyHours: 4, prereqKey: 'SE101', year: 'Y2' },
    { code: 'SE301', name: 'Software Engineering Principles',   credits: 3, weeklyHours: 4, year: 'Y3' },
    { code: 'SE302', name: 'Web Application Development',       credits: 3, weeklyHours: 4, year: 'Y3' },
    { code: 'SE303', name: 'Research Methodology',              credits: 2, weeklyHours: 2, isPrereq: true, year: 'Y3' },
    { code: 'SE401', name: 'Internship',                        credits: 6, weeklyHours: 0, prereqKey: 'SE303', year: 'Y4' },
    { code: 'SE402', name: 'Final Year Project',                credits: 6, weeklyHours: 0, year: 'Y4' },
  ],
  ISM: [
    { code: 'ISM101', name: 'Introduction to Programming',     credits: 3, weeklyHours: 4, isPrereq: true, year: 'Y1' },
    { code: 'ISM201', name: 'Database Management Systems',     credits: 3, weeklyHours: 4, prereqKey: 'ISM101', year: 'Y2' },
    { code: 'ISM202', name: 'Systems Analysis and Design',     credits: 3, weeklyHours: 4, year: 'Y2' },
    { code: 'ISM301', name: 'Enterprise Resource Planning',    credits: 3, weeklyHours: 4, year: 'Y3' },
    { code: 'ISM302', name: 'Research Methodology',            credits: 2, weeklyHours: 2, isPrereq: true, year: 'Y3' },
    { code: 'ISM401', name: 'Internship',                      credits: 6, weeklyHours: 0, prereqKey: 'ISM302', year: 'Y4' },
  ],
  ITN: [
    { code: 'ITN101', name: 'Computer Networks I',             credits: 3, weeklyHours: 4, year: 'Y1' },
    { code: 'ITN201', name: 'Computer Networks II',            credits: 3, weeklyHours: 4, prereqKey: 'ITN101', year: 'Y2' },
    { code: 'ITN202', name: 'Network Security',                credits: 3, weeklyHours: 4, year: 'Y2' },
    { code: 'ITN301', name: 'Cloud Computing',                 credits: 3, weeklyHours: 4, year: 'Y3' },
    { code: 'ITN302', name: 'Research Methodology',            credits: 2, weeklyHours: 2, isPrereq: true, year: 'Y3' },
    { code: 'ITN401', name: 'Internship',                      credits: 6, weeklyHours: 0, prereqKey: 'ITN302', year: 'Y4' },
  ],
  ITM: [
    { code: 'ITM101', name: 'Digital Media Fundamentals',       credits: 3, weeklyHours: 4, year: 'Y1' },
    { code: 'ITM201', name: 'Graphic Design',                   credits: 3, weeklyHours: 4, year: 'Y2' },
    { code: 'ITM202', name: 'Video Production',                 credits: 3, weeklyHours: 4, year: 'Y3' },
    { code: 'ITM301', name: 'Research Methodology',             credits: 2, weeklyHours: 2, isPrereq: true, year: 'Y3' },
    { code: 'ITM401', name: 'Internship',                       credits: 6, weeklyHours: 0, prereqKey: 'ITM301', year: 'Y4' },
  ],
  LAW: [
    { code: 'LAW101', name: 'Introduction to Law',              credits: 3, weeklyHours: 4, year: 'Y1' },
    { code: 'LAW201', name: 'Constitutional Law',               credits: 3, weeklyHours: 4, year: 'Y2' },
    { code: 'LAW202', name: 'Criminal Law',                     credits: 3, weeklyHours: 4, year: 'Y3' },
    { code: 'LAW301', name: 'Commercial Law',                   credits: 3, weeklyHours: 4, year: 'Y3' },
    { code: 'LAW302', name: 'Research Methodology',             credits: 2, weeklyHours: 2, isPrereq: true, year: 'Y3' },
    { code: 'LAW401', name: 'Internship',                       credits: 6, weeklyHours: 0, prereqKey: 'LAW302', year: 'Y4' },
  ],
  ACC: [
    { code: 'ACC101', name: 'Financial Accounting I',           credits: 3, weeklyHours: 4, year: 'Y1' },
    { code: 'ACC201', name: 'Financial Accounting II',          credits: 3, weeklyHours: 4, prereqKey: 'ACC101', year: 'Y2' },
    { code: 'ACC202', name: 'Management Accounting',            credits: 3, weeklyHours: 4, year: 'Y2' },
    { code: 'ACC301', name: 'Auditing',                         credits: 3, weeklyHours: 4, year: 'Y3' },
    { code: 'ACC302', name: 'Research Methodology',             credits: 2, weeklyHours: 2, isPrereq: true, year: 'Y3' },
    { code: 'ACC401', name: 'Internship',                       credits: 6, weeklyHours: 0, prereqKey: 'ACC302', year: 'Y4' },
  ],
  RD: [
    { code: 'RD101', name: 'Introduction to Rural Development', credits: 3, weeklyHours: 4, year: 'Y1' },
    { code: 'RD201', name: 'Community Development',             credits: 3, weeklyHours: 4, year: 'Y2' },
    { code: 'RD202', name: 'Environmental Management',          credits: 3, weeklyHours: 4, year: 'Y3' },
    { code: 'RD301', name: 'Research Methodology',              credits: 2, weeklyHours: 2, isPrereq: true, year: 'Y3' },
    { code: 'RD401', name: 'Internship',                        credits: 6, weeklyHours: 0, prereqKey: 'RD301', year: 'Y4' },
  ],
};

async function main() {
  console.log('🌱 Starting UNILAK database seed...');

  // ─── 1. Roles ───────────────────────────────────────────────────────────────
  console.log('📋 Creating roles...');
  const roles = await Promise.all([
    prisma.role.upsert({
      where: { name: RoleType.SUPER_ADMIN },
      update: {},
      create: { name: RoleType.SUPER_ADMIN, description: 'Super Administrator', permissions: JSON.stringify(['all']) }
    }),
    prisma.role.upsert({
      where: { name: RoleType.ADMIN },
      update: {},
      create: { name: RoleType.ADMIN, description: 'Administrator — builds and manages the system', permissions: JSON.stringify(['manage_users', 'manage_departments', 'manage_system']) }
    }),
    prisma.role.upsert({
      where: { name: RoleType.HOD },
      update: {},
      create: { name: RoleType.HOD, description: 'Head of Department — manages timetables for their department', permissions: JSON.stringify(['manage_timetables', 'manage_courses', 'manage_instructors']) }
    }),
    prisma.role.upsert({
      where: { name: RoleType.INSTRUCTOR },
      update: {},
      create: { name: RoleType.INSTRUCTOR, description: 'Lecturer/Instructor', permissions: JSON.stringify(['view_timetable', 'manage_availability']) }
    }),
  ]);

  const roleMap = Object.fromEntries(roles.map(r => [r.name, r.id]));

  // ─── 2. Admin User ──────────────────────────────────────────────────────────
  console.log('👤 Creating administrator...');
  const adminPassword = await bcrypt.hash('Admin@2025!', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@unilak.ac.rw' },
    update: {},
    create: {
      email: 'admin@unilak.ac.rw',
      username: 'admin_unilak',
      password: adminPassword,
      firstName: 'System',
      lastName: 'Administrator',
      isActive: true,
      isVerified: true,
      roles: { create: { roleId: roleMap[RoleType.ADMIN] } }
    }
  });
  const creatorId = admin.id;
  console.log(`   ✅ Admin created: admin@unilak.ac.rw / Admin@2025!`);

  // ─── 3. Academic Years & Semesters ──────────────────────────────────────────
  console.log('📅 Creating academic years...');
  const ay = await prisma.academicYear.upsert({
    where: { year: '2024-2025' },
    update: { isCurrent: true },
    create: { year: '2024-2025', startDate: new Date('2024-09-01'), endDate: new Date('2025-06-30'), isCurrent: true }
  });

  const sem1 = await prisma.semester.upsert({
    where: { academicYearId_number: { academicYearId: ay.id, number: 1 } },
    update: {},
    create: { academicYearId: ay.id, name: 'Semester 1 2024-2025', type: SemesterType.FALL, number: 1, startDate: new Date('2024-09-01'), endDate: new Date('2025-01-31'), isCurrent: false }
  });
  const sem2 = await prisma.semester.upsert({
    where: { academicYearId_number: { academicYearId: ay.id, number: 2 } },
    update: { isCurrent: true },
    create: { academicYearId: ay.id, name: 'Semester 2 2024-2025', type: SemesterType.SPRING, number: 2, startDate: new Date('2025-02-01'), endDate: new Date('2025-06-30'), isCurrent: true }
  });
  const activeSemester = sem2;

  // ─── 4. Rooms ────────────────────────────────────────────────────────────────
  console.log('🏢 Creating rooms...');
  const roomNames = ['Karisimbi', 'Bisoke', 'Muhabura', 'Sabyinyo', 'Gahinga', 'Rebero', 'Jali', 'Kigali', 'Rubavu', 'Musanze'];
  for (let i = 0; i < roomNames.length; i++) {
    await prisma.room.upsert({
      where: { number: `RM-${100 + i}` },
      update: {},
      create: { name: roomNames[i], number: `RM-${100 + i}`, building: i < 5 ? 'Main Block' : 'Annex Block', capacity: 60, type: 'LECTURE_HALL', hasProjector: true, isActive: true }
    });
  }

  // ─── 5. Time Slots ───────────────────────────────────────────────────────────
  console.log('⏰ Creating time slots...');
  
  // Slot definitions based on user requirements
  const daySlot = { start: '08:00', end: '14:00', slot: 1, duration: 360, prog: ProgramType.DAY };
  const eveningSlot = { start: '17:30', end: '21:30', slot: 1, duration: 240, prog: ProgramType.EVENING };
  
  const weekendSatSlot = { start: '18:00', end: '22:00', slot: 1, duration: 240, prog: ProgramType.WEEKEND };
  const weekendSunSlot1 = { start: '08:00', end: '13:00', slot: 1, duration: 300, prog: ProgramType.WEEKEND };
  const weekendSunSlot2 = { start: '13:00', end: '17:00', slot: 2, duration: 240, prog: ProgramType.WEEKEND };

  for (const day of DAYS) {
    let toCreate: any[] = [];
    
    if (day === DayOfWeek.SATURDAY) {
      // Saturday only post-Sabbath evening
      toCreate = [weekendSatSlot];
    } else if (day === DayOfWeek.SUNDAY) {
      // Sunday is full day
      toCreate = [weekendSunSlot1, weekendSunSlot2];
    } else {
      // Weekdays: Day and Evening
      toCreate = [daySlot, eveningSlot];
    }
    
    for (const s of toCreate) {
      await prisma.timeSlot.upsert({
        where: { day_startTime_endTime: { day, startTime: s.start, endTime: s.end } },
        update: { programType: s.prog, duration: s.duration, slotNumber: s.slot, isActive: true },
        create: { day, startTime: s.start, endTime: s.end, slotNumber: s.slot, duration: s.duration, programType: s.prog, isActive: true }
      });
    }
  }

  // ─── 6. Levels ───────────────────────────────────────────────────────────────
  console.log('📊 Creating levels...');
  const levelMap: Record<string, string> = {};
  for (const [code, name] of [['Y1', 'Year 1'], ['Y2', 'Year 2'], ['Y3', 'Year 3'], ['Y4', 'Year 4']]) {
    const lv = await prisma.level.upsert({ where: { code }, update: {}, create: { name, code, isActive: true } });
    levelMap[code] = lv.id;
  }

  // ─── 7. Faculties ────────────────────────────────────────────────────────────
  console.log('🏛️  Creating UNILAK faculties...');
  const facultyMap: Record<string, string> = {};  // code -> id
  for (const f of FACULTIES) {
    const fac = await (prisma as any).faculty.upsert({
      where: { code: f.code },
      update: { name: f.name },
      create: { name: f.name, code: f.code, description: f.description, isActive: true }
    });
    facultyMap[f.code] = fac.id;
    console.log(`   ✅ Faculty: ${f.name}`);
  }

  // ─── 8. Departments (with faculty links) ─────────────────────────────────────
  console.log('🏢 Creating departments...');
  const deptMap: Record<string, string> = {};  // code -> id
  for (const [facCode, depts] of Object.entries(DEPARTMENTS_BY_FACULTY)) {
    for (const d of depts) {
      const dept = await prisma.department.upsert({
        where: { code: d.code },
        update: { name: d.name, facultyId: facultyMap[facCode] },
        create: {
          code: d.code,
          name: d.name,
          facultyId: facultyMap[facCode],
          dailyDayHours: 6,
          dailyEveningHours: 4,
          dailyWeekendSatHours: 4,
          dailyWeekendSunHours: 6,
          createdById: creatorId,
          isActive: true
        }
      });
      deptMap[d.code] = dept.id;
      console.log(`   ✅ Dept: ${d.name} (${facCode} Faculty)`);
    }
  }

  // ─── 9. Instructors (5 per department) ───────────────────────────────────────
  console.log('👨‍🏫 Creating lecturers (5 per department)...');
  const instrPassword = await bcrypt.hash('Lecturer@2025!', 12);
  const instructorMap: Record<string, string[]> = {};  // deptCode -> [instructorId...]

  for (const [deptCode, lecturers] of Object.entries(DEPT_LECTURERS)) {
    instructorMap[deptCode] = [];
    for (let i = 0; i < lecturers.length; i++) {
      const lect = lecturers[i];
      const email = `${lect.firstName.toLowerCase().replace(/[^a-z]/g, '')}.${lect.lastName.toLowerCase()}@unilak.ac.rw`;
      const empId = `EMP-${deptCode}-${String(i + 1).padStart(2, '0')}`;
      const user = await prisma.user.upsert({
        where: { email },
        update: {},
        create: {
          email,
          username: `${lect.firstName.toLowerCase().replace(/[^a-z]/g, '')}_${lect.lastName.toLowerCase()}`,
          password: instrPassword,
          firstName: lect.firstName,
          lastName: lect.lastName,
          isActive: true,
          isVerified: true,
          roles: { create: { roleId: roleMap[RoleType.INSTRUCTOR] } }
        }
      });
      const instr = await prisma.instructor.upsert({
        where: { employeeId: empId },
        update: {},
        create: {
          userId: user.id,
          employeeId: empId,
          departmentId: deptMap[deptCode],
          title: lect.title,
          isActive: true,
          maxWeeklyHours: 20
        }
      });
      instructorMap[deptCode].push(instr.id);
    }
    console.log(`   ✅ ${lecturers.length} lecturers created for ${deptCode}`);
  }

  // ─── 10. Courses + Prerequisites ─────────────────────────────────────────────
  console.log('📚 Creating courses with prerequisites...');
  const courseCodeToId: Record<string, string> = {};

  // First pass: create all courses
  for (const [deptCode, courses] of Object.entries(COURSES_BY_DEPT)) {
    const instrIds = instructorMap[deptCode] || [];
    for (let i = 0; i < courses.length; i++) {
      const c = courses[i];
      const course = await prisma.course.upsert({
        where: { code: c.code },
        update: { name: c.name },
        create: {
          code: c.code,
          name: c.name,
          credits: c.credits,
          weeklyHours: c.weeklyHours,
          type: CourseType.THEORY,
          programType: ProgramType.DAY,
          maxStudents: 50,
          departmentId: deptMap[deptCode],
          semesterId: activeSemester.id,
          levelId: levelMap[c.year || 'Y1'],
          level: c.year ? `Year ${c.year.replace('Y', '')}` : 'Year 1',
          instructorId: instrIds.length > 0 ? instrIds[i % instrIds.length] : undefined,
          createdById: creatorId,
          isActive: true
        }
      });
      courseCodeToId[c.code] = course.id;
    }
    console.log(`   ✅ ${courses.length} courses created for ${deptCode}`);
  }

  // Second pass: link prerequisites
  console.log('🔗 Linking course prerequisites...');
  let prereqCount = 0;
  for (const [deptCode, courses] of Object.entries(COURSES_BY_DEPT)) {
    for (const c of courses) {
      if (c.prereqKey) {
        const courseId = courseCodeToId[c.code];
        const prereqId = courseCodeToId[c.prereqKey];
        if (courseId && prereqId) {
          await prisma.coursePrerequisite.upsert({
            where: { courseId_prerequisiteId: { courseId, prerequisiteId: prereqId } },
            update: {},
            create: { courseId, prerequisiteId: prereqId }
          });
          const prereqName = COURSES_BY_DEPT[deptCode]?.find(x => x.code === c.prereqKey)?.name ?? c.prereqKey;
          console.log(`   🔗 ${c.code} (${c.name}) requires: ${prereqName}`);
          prereqCount++;
        }
      }
    }
  }
  console.log(`   ✅ ${prereqCount} prerequisite links created`);

  console.log('\n✅ UNILAK Seeding completed!');
  console.log('─────────────────────────────────────');
  console.log('🔑 Admin Login:      admin@unilak.ac.rw  /  Admin@2025!');
  console.log('📋 Faculties:       ', FACULTIES.length);
  console.log('🏢 Departments:     ', Object.values(DEPARTMENTS_BY_FACULTY).flatMap(d => d).length);
  console.log('👨‍🏫 Instructors:     ', Object.values(DEPT_LECTURERS).flatMap(l => l).length);
  console.log('📚 Courses:         ', Object.values(COURSES_BY_DEPT).flatMap(c => c).length);
  console.log('🔗 Prerequisites:   ', prereqCount);
  console.log('─────────────────────────────────────');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
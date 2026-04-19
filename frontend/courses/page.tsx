"use client";

import { useState } from "react";
import { Plus, Search, Edit, Trash2, Filter, Power, BookOpen, Upload, Download, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useCourses, useCreateCourse, useUpdateCourse, useDeleteCourse, useBulkCreateCourses, useDepartments, useSemesters, useStudent, useStudentCourses, useLevels, useIntakes, useFaculties } from "@/lib/queries";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { hasPermission } from "@/lib/access-control";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

const COURSE_TYPES = ["THEORY", "PRACTICAL", "LAB", "TUTORIAL", "SEMINAR", "WORKSHOP", "PROJECT"];

export default function CoursesPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [facultyFilter, setFacultyFilter] = useState<string>("all");
  const [intakeFilter, setIntakeFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<any>(null);
  const [deletingCourse, setDeletingCourse] = useState<any>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [parsedCSVData, setParsedCSVData] = useState<any[]>([]);
  const [csvPreview, setCsvPreview] = useState<string[][]>([]);
  const [bulkCreateResults, setBulkCreateResults] = useState<any>(null);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>(""); // Department selection for bulk create

  // Check if user is a student
  const isStudent = user?.role === 'STUDENT';
  // HODs see only their faculty — Department column is redundant for them
  const isHOD = user?.role === 'HOD';

  // Fetch student profile if user is a student
  const { data: studentData } = useStudent(isStudent && user?.id ? user.id : '');
  const studentProfileId = isStudent && studentData && studentData.id ? studentData.id : null;

  // Check permissions
  const canCreate = hasPermission(user?.timetableAccess, 'courses', 'create');
  const canUpdate = hasPermission(user?.timetableAccess, 'courses', 'update');
  const canDelete = hasPermission(user?.timetableAccess, 'courses', 'delete');
  const canView = hasPermission(user?.timetableAccess, 'courses', 'view');

  // Fetch data - use student courses if student, otherwise all courses
  const { data: studentCoursesData, isLoading: isLoadingStudentCourses } = useStudentCourses(
    studentProfileId || '',
    { isActive: true }
  );

  const { data, isLoading } = useCourses({
    page,
    limit: 10,
    search: search || undefined,
    departmentId: deptFilter !== "all" ? deptFilter : undefined,
    facultyId: facultyFilter !== "all" ? facultyFilter : undefined,
    intakeId: intakeFilter !== "all" ? intakeFilter : undefined,
  });

  const { data: intakesData } = useIntakes();

  const { data: deptsData } = useDepartments({ page: 1, limit: 100 });
  const { data: facultiesData } = useFaculties({ limit: 100 });
  const { data: semestersData } = useSemesters();
  const { data: levelsData } = useLevels({ limit: 1000 });
  
  // Fetch all courses for prerequisite selection
  const { data: allCoursesResponse } = useCourses({ 
    limit: 1000, 
    isActive: true 
  });
  const allCourses = allCoursesResponse?.data || [];

  // Use student courses data if student, otherwise use regular courses data
  const coursesData = isStudent ? studentCoursesData : data?.data;
  const isLoadingCourses = isStudent ? isLoadingStudentCourses : isLoading;

  const createCourse = useCreateCourse();
  const updateCourse = useUpdateCourse();
  const deleteCourse = useDeleteCourse();
  const bulkCreateCourse = useBulkCreateCourses();

  const handleCreate = async (formData: any) => {
    try {
      if (editingCourse) {
        await updateCourse.mutateAsync({ id: editingCourse.id, data: formData });
      } else {
        await createCourse.mutateAsync(formData);
      }
      setIsDialogOpen(false);
      setEditingCourse(null);
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleEdit = (course: any) => {
    setEditingCourse(course);
    setIsDialogOpen(true);
  };

  const handleDeleteCourse = async () => {
    if (!deletingCourse) return;
    try {
      await deleteCourse.mutateAsync(deletingCourse.id);
      setDeletingCourse(null);
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleToggleStatus = async (courseId: string, currentStatus: boolean) => {
    try {
      await updateCourse.mutateAsync({
        id: courseId,
        data: { isActive: !currentStatus },
      });
    } catch (error) {
      // Error handled by mutation
    }
  };

  const parseCSVFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim());

      // Show preview of first 6 rows
      const preview = lines.slice(0, 6).map(line => line.split(',').map(cell => cell.trim()));
      setCsvPreview(preview);

      // Create lookup maps for department and semester codes to IDs
      const deptCodeToId = new Map();
      const semCodeToId = new Map();

      deptsData?.data?.forEach((dept: any) => {
        deptCodeToId.set(dept.code.toLowerCase(), dept.id);
        deptCodeToId.set(dept.id, dept.id); // Also accept direct ID
      });

      semestersData?.data?.forEach((sem: any) => {
        semCodeToId.set(sem.code?.toLowerCase(), sem.id);
        semCodeToId.set(sem.name?.toLowerCase(), sem.id);
        semCodeToId.set(sem.id, sem.id); // Also accept direct ID
      });

      // Parse data (skip header row)
      const headerRow = lines[0]?.toLowerCase() || '';
      const headers = headerRow.split(',').map(h => h.trim());

      const getIdx = (name: string) => headers.indexOf(name.toLowerCase());

      const codeIdx = getIdx('code');
      const nameIdx = getIdx('name');
      const creditsIdx = getIdx('credits');
      const hoursIdx = getIdx('weeklyhours');
      const typeIdx = getIdx('type');
      const progTypeIdx = getIdx('programtype');
      const semIdx = getIdx('semesterid');
      const maxIdx = getIdx('maxstudents');
      const minIdx = getIdx('minstudents');
      const activeIdx = getIdx('isactive');

      const parsed = lines.slice(1).map((line, idx) => {
        const parts = line.split(',').map(part => part.trim());

        // Try to resolve semester ID
        let semId = parts[semIdx] || '';
        if (semCodeToId.has(semId.toLowerCase())) {
          semId = semCodeToId.get(semId.toLowerCase());
        }

        return {
          code: codeIdx !== -1 ? parts[codeIdx] : '',
          name: nameIdx !== -1 ? parts[nameIdx] : '',
          credits: creditsIdx !== -1 ? parseInt(parts[creditsIdx]) || 3 : 3,
          weeklyHours: hoursIdx !== -1 ? parseInt(parts[hoursIdx]) || 3 : 3,
          type: typeIdx !== -1 ? parts[typeIdx] : 'THEORY',
          programType: progTypeIdx !== -1 ? parts[progTypeIdx] : 'DAY',
          semesterId: semId,
          maxStudents: maxIdx !== -1 ? parseInt(parts[maxIdx]) || 50 : 50,
          minStudents: minIdx !== -1 ? parseInt(parts[minIdx]) || 10 : 10,
          isActive: activeIdx !== -1 ? parts[activeIdx].toLowerCase() === 'true' : true,
        };
      }).filter(course => course.code && course.name);

      setParsedCSVData(parsed);
    };
    reader.readAsText(file);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'text/csv') {
      setCsvFile(file);
      parseCSVFile(file);
    }
  };

  const generateCSVTemplate = () => {
    if (!deptsData?.data?.length || !semestersData?.data?.length) {
      toast.error('Please wait for departments and semesters to load');
      return;
    }

    // Use first department and semester as defaults
    const deptId = deptsData.data[0]?.id || 'N/A';
    const deptId2 = deptsData.data.length > 1 ? deptsData.data[1]?.id : deptId;
    const deptId3 = deptsData.data.length > 2 ? deptsData.data[2]?.id : deptId;
    const deptId4 = deptsData.data.length > 3 ? deptsData.data[3]?.id : deptId;
    const deptId5 = deptsData.data.length > 4 ? deptsData.data[4]?.id : deptId;
    const deptId6 = deptsData.data.length > 5 ? deptsData.data[5]?.id : deptId;
    const deptId7 = deptsData.data.length > 6 ? deptsData.data[6]?.id : deptId;
    const deptId8 = deptsData.data.length > 7 ? deptsData.data[7]?.id : deptId;

    const semId1 = semestersData.data[0]?.id || 'N/A';
    const semId2 = semestersData.data.length > 1 ? semestersData.data[1]?.id : semId1;
    const semId3 = semestersData.data.length > 2 ? semestersData.data[2]?.id : semId1;

    // CSV template without departmentId (it's selected separately)
    const template = `code,name,credits,weeklyHours,type,programType,semesterId,maxStudents,minStudents,isActive
CS101,Introduction to Computer Science,3,3,THEORY,DAY,${semId1},50,10,true
CS201,Data Structures and Algorithms,3,3,THEORY,DAY,${semId1},45,10,true
CS301,Database Management Systems,3,3,PRACTICAL,EVENING,${semId2},40,8,true
CS401,Software Engineering Principles,3,4,THEORY,EVENING,${semId2},35,10,true
CS501,Artificial Intelligence,3,3,THEORY,WEEKEND,${semId3},30,10,true
CS102,Computer Networks,3,3,THEORY,DAY,${semId1},45,10,true
CS202,Operating Systems,3,3,THEORY,EVENING,${semId2},40,10,true
CS302,Web Development,3,3,PRACTICAL,EVENING,${semId2},35,8,true
CS402,Cloud Computing,3,3,THEORY,WEEKEND,${semId3},30,10,true
CS502,Cybersecurity Fundamentals,3,3,THEORY,WEEKEND,${semId3},30,10,true
MATH101,Calculus I,3,3,THEORY,DAY,${semId1},60,15,true
MATH201,Calculus II,3,3,THEORY,DAY,${semId1},60,15,true
MATH301,Linear Algebra,3,3,THEORY,EVENING,${semId2},55,15,true
MATH401,Discrete Mathematics,3,3,THEORY,EVENING,${semId2},50,12,true
ENG101,English Composition,2,2,THEORY,DAY,${semId1},40,10,true
ENG201,Technical Writing,2,2,PRACTICAL,EVENING,${semId2},35,8,true
PHYS201,Physics for Engineers I,3,4,LAB,DAY,${semId1},30,10,true
PHYS202,Physics for Engineers II,3,4,LAB,EVENING,${semId2},30,10,true
CHEM101,General Chemistry,3,4,LAB,DAY,${semId1},35,8,true
STAT301,Statistics for Data Science,3,3,PRACTICAL,WEEKEND,${semId3},35,10,true`;

    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bulk_courses_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleBulkCreate = async () => {
    if (parsedCSVData.length === 0) {
      toast.error("No courses to create");
      return;
    }

    if (!selectedDepartmentId) {
      toast.error("Please select a department first");
      return;
    }

    try {
      const result = await bulkCreateCourse.mutateAsync({
        departmentId: selectedDepartmentId,
        courses: parsedCSVData
      });
      const data = result as any;
      setBulkCreateResults({
        inserted: data.summary?.created || 0,
        total: data.summary?.total || parsedCSVData.length,
        errors: data.errors,
      });
    } catch (error) {
      setBulkCreateResults({ error: 'Failed to create courses' });
    }
  };

  const getCourseTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      THEORY: "bg-blue-500",
      PRACTICAL: "bg-green-500",
      LAB: "bg-purple-500",
      TUTORIAL: "bg-orange-500",
      SEMINAR: "bg-pink-500",
      WORKSHOP: "bg-yellow-500",
      PROJECT: "bg-cyan-500",
    };
    return <Badge className={colors[type] || "bg-gray-500"}>{type}</Badge>;
  };

  if (!canView) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md bg-gray-800 border-gray-700">
          <CardContent className="p-6 text-center">
            <BookOpen className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">Access Denied</h2>
            <p className="text-gray-400">You don't have permission to view courses.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">
            {isStudent ? "My Courses" : "Courses Management"}
          </h1>
          <p className="text-gray-400 mt-1">
            {isStudent ? "View your enrolled courses" : "Manage academic courses"}
          </p>
        </div>
        {canCreate && !isStudent && (
          <div className="flex gap-2">
            <Dialog open={isDialogOpen} onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (!open) setEditingCourse(null);
            }}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Course
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-slate-800 border-emerald-500/30 text-white max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingCourse ? "Edit Course" : "Create Course"}</DialogTitle>
                  <DialogDescription className="text-gray-400">
                    {editingCourse ? "Update course information" : "Add a new course"}
                  </DialogDescription>
                </DialogHeader>
                <CourseForm
                  onSubmit={handleCreate}
                  initialData={editingCourse}
                  departments={deptsData?.data || []}
                  semesters={semestersData?.data || []}
                  levels={levelsData?.data || []}
                  intakes={intakesData?.data || []}
                  allCourses={allCourses}
                  isSubmitting={createCourse.isPending || updateCourse.isPending}
                />
              </DialogContent>
            </Dialog>

            <Dialog open={isBulkOpen} onOpenChange={setIsBulkOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10">
                  <Upload className="w-4 h-4 mr-2" />
                  Bulk Create
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-slate-800 border-emerald-500/30 text-white max-w-5xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Bulk Create Courses</DialogTitle>
                  <DialogDescription className="text-gray-400">
                    Upload CSV file to create multiple courses at once
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-6">
                  {/* Department Selection - Required First */}
                  <div className="p-4 bg-blue-500/20 border border-blue-500/30 rounded-lg">
                    <Label className="text-blue-400 font-medium mb-2 block">
                      Select Faculty * (applies to all courses)
                    </Label>
                    <Select
                      value={selectedDepartmentId}
                      onValueChange={setSelectedDepartmentId}
                      required
                    >
                      <SelectTrigger className="bg-slate-700 border-blue-500/30 text-white">
                        <SelectValue placeholder="Select faculty for all courses" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-blue-500/30">
                        {deptsData?.data?.map((dept: any) => (
                          <SelectItem key={dept.id} value={dept.id} className="text-white">
                            {dept.code} - {dept.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-sm text-blue-300 mt-2">
                      All courses in the CSV will be assigned to this faculty
                    </p>
                  </div>

                  {/* Template Download */}
                  <div className="flex justify-between items-center p-4 bg-emerald-500/20 border border-emerald-500/30 rounded-lg">
                    <div>
                      <h4 className="font-medium text-emerald-400">Need a template?</h4>
                      <p className="text-sm text-emerald-300">
                        Download our CSV template with sample courses (20 courses)
                      </p>
                      <p className="text-xs text-emerald-200 mt-1">
                        Note: CSV no longer includes departmentId column - select department above
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={generateCSVTemplate} className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10">
                      <Download className="w-4 h-4 mr-2" />
                      Download Template
                    </Button>
                  </div>

                  {/* CSV File Upload */}
                  <div className="border-2 border-dashed border-emerald-500/30 rounded-lg p-8 text-center">
                    <Upload className="w-12 h-12 text-emerald-500/50 mx-auto mb-4" />
                    <Label htmlFor="csv-upload" className="cursor-pointer">
                      <span className="text-lg font-medium text-emerald-400">
                        {csvFile ? csvFile.name : 'Click to upload CSV file'}
                      </span>
                      <p className="text-sm text-gray-400 mt-2">
                        CSV files only. Maximum file size: 10MB
                      </p>
                      <input
                        id="csv-upload"
                        type="file"
                        accept=".csv"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </Label>
                  </div>

                  {/* File Upload Status Card */}
                  {csvFile && parsedCSVData.length > 0 && (
                    <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border border-emerald-500/40 rounded-lg p-6 space-y-4">
                      <div className="flex items-center gap-4">
                        <div className="bg-emerald-500/20 p-3 rounded-lg">
                          <Upload className="w-6 h-6 text-emerald-400" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold text-emerald-300 text-lg">{csvFile.name}</h4>
                          <p className="text-sm text-gray-400">{(csvFile.size / 1024).toFixed(2)} KB</p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-emerald-400">{parsedCSVData.length}</p>
                          <p className="text-sm text-gray-400">courses ready</p>
                        </div>
                      </div>

                      {parsedCSVData.length !== csvPreview.length - 1 && (
                        <div className="flex gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-md">
                          <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                          <p className="text-sm text-amber-300">
                            Some rows were skipped due to missing course code or name
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Results */}
                  {bulkCreateResults && (
                    <div className="mt-6">
                      <h4 className="font-medium text-emerald-400 mb-3">Bulk Create Results:</h4>
                      {bulkCreateResults.error ? (
                        <Alert className="border-red-500/30 bg-red-500/10">
                          <AlertCircle className="h-4 w-4 text-red-400" />
                          <AlertDescription className="text-red-300">{bulkCreateResults.error}</AlertDescription>
                        </Alert>
                      ) : (
                        <Alert className="border-emerald-500/30 bg-emerald-500/10">
                          <BookOpen className="h-4 w-4 text-emerald-400" />
                          <AlertDescription className="text-emerald-300">
                            Successfully created {bulkCreateResults.inserted} out of {bulkCreateResults.total} courses.
                            {bulkCreateResults.inserted < bulkCreateResults.total && (
                              <span className="block mt-2">
                                {bulkCreateResults.errors?.length || 0} course(s) failed to create due to validation errors.
                              </span>
                            )}
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-3 pt-6">
                  <Button variant="outline" onClick={() => {
                    setIsBulkOpen(false);
                    setCsvFile(null);
                    setParsedCSVData([]);
                    setCsvPreview([]);
                    setBulkCreateResults(null);
                    setSelectedDepartmentId("");
                  }} className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10">
                    Cancel
                  </Button>
                  <Button
                    onClick={handleBulkCreate}
                    disabled={bulkCreateCourse.isPending || parsedCSVData.length === 0 || !selectedDepartmentId}
                    className="bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-6"
                  >
                    {bulkCreateCourse.isPending ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Processing...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <BookOpen className="w-4 h-4" />
                        {`Create ${parsedCSVData.length} Course${parsedCSVData.length !== 1 ? 's' : ''}`}
                      </span>
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {/* Filters - Hide for students */}
      {!isStudent && (
        <Card className="bg-slate-800/50 border-emerald-500/20">
          <CardContent className="p-4">
            <div className="flex gap-4 items-center flex-wrap">
              <div className="relative flex-1 min-w-[250px]">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Search courses..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="pl-10 bg-slate-700 border-emerald-500/30 text-white placeholder:text-gray-500"
                />
              </div>
              <Select value={deptFilter} onValueChange={(v) => {
                setDeptFilter(v);
                setPage(1);
              }}>
                <SelectTrigger className="w-[200px] bg-slate-700 border-emerald-500/30 text-white">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="All Departments" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-emerald-500/30">
                  <SelectItem value="all" className="text-white">All Departments</SelectItem>
                  {deptsData?.data?.map((dept: any) => (
                    <SelectItem key={dept.id} value={dept.id} className="text-white">
                      {dept.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={facultyFilter} onValueChange={(v) => {
                setFacultyFilter(v);
                setPage(1);
              }}>
                <SelectTrigger className="w-[200px] bg-slate-700 border-emerald-500/30 text-white">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="All Faculties" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-emerald-500/30">
                  <SelectItem value="all" className="text-white">All Faculties</SelectItem>
                  {facultiesData?.data?.map((faculty: any) => (
                    <SelectItem key={faculty.id} value={faculty.id} className="text-white">
                      {faculty.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={intakeFilter} onValueChange={(v) => {
                setIntakeFilter(v);
                setPage(1);
              }}>
                <SelectTrigger className="w-[200px] bg-slate-700 border-emerald-500/30 text-white">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="All Intakes" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-emerald-500/30">
                  <SelectItem value="all" className="text-white">All Intakes</SelectItem>
                  {/* Only show January, March, September intakes */}
                  {intakesData?.data
                    ?.filter((intake: any) => /january|march|september/i.test(intake.name))
                    .map((intake: any) => (
                      <SelectItem key={intake.id} value={intake.id} className="text-white">
                        {intake.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Courses Table */}
      <Card className="bg-slate-800/50 border-emerald-500/20">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-emerald-500/20 hover:bg-emerald-500/10">
                <TableHead className="text-emerald-400 w-12">#</TableHead>
                <TableHead className="text-emerald-400">Code</TableHead>
                <TableHead className="text-emerald-400">Name</TableHead>
                {!isHOD && <TableHead className="text-emerald-400">Department</TableHead>}
                <TableHead className="text-emerald-400">Program</TableHead>
                <TableHead className="text-emerald-400">Type</TableHead>
                <TableHead className="text-emerald-400">Intake</TableHead>
                <TableHead className="text-emerald-400">Prerequisites</TableHead>
                <TableHead className="text-emerald-400">Exams</TableHead>
                {isStudent && <TableHead className="text-emerald-400">Grade</TableHead>}
                {!isStudent && <TableHead className="text-emerald-400">Status</TableHead>}
                {!isStudent && <TableHead className="text-emerald-400 text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingCourses ? (
                <TableRow>
                  <TableCell colSpan={isStudent ? 8 : 9} className="text-center text-gray-400 py-10">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : !coursesData?.length ? (
                <TableRow>
                  <TableCell colSpan={isStudent ? 8 : 9} className="text-center text-gray-400 py-8">
                    {isStudent
                      ? (studentProfileId
                        ? "No enrolled courses found"
                        : "Please create your student profile first to view enrolled courses")
                      : "No courses found"}
                  </TableCell>
                </TableRow>
              ) : (
                coursesData.map((enrollment: any, index: number) => {
                  // For students, enrollment is a CourseEnrollment object with course nested
                  // For admins, it's a Course object directly
                  const course = isStudent ? enrollment.course : enrollment;
                  const grade = isStudent ? enrollment.grade : null;

                  return (
                    <TableRow key={course.id} className="border-emerald-500/10 hover:bg-emerald-500/5">
                      <TableCell className="text-gray-400 font-medium w-12">
                        {index + 1}
                      </TableCell>
                      <TableCell className="text-white font-mono font-semibold py-4">{course.code}</TableCell>
                      <TableCell className="text-white font-medium py-4">{course.name}</TableCell>
                      {!isHOD && <TableCell className="text-gray-300 py-4">{course.department?.code || "-"}</TableCell>}
                      <TableCell className="text-gray-300 py-4">
                        <div className="flex flex-col gap-1">
                          <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 text-[10px] w-fit">
                            {course.programType || "DAY"}
                          </Badge>
                          {course.level && <span className="text-[10px] text-gray-400 font-medium">{course.level}</span>}
                        </div>
                      </TableCell>
                      <TableCell className="py-4">{getCourseTypeBadge(course.type)}</TableCell>
                      <TableCell className="text-gray-300 py-4">{course.intakeModel?.name || "-"}</TableCell>
                      <TableCell className="py-4">
                        <div className="flex flex-wrap gap-1 max-w-[150px]">
                          {course.prerequisites?.length > 0 ? (
                            course.prerequisites.map((p: any) => (
                              <Badge key={p.prerequisiteId} variant="secondary" className="bg-slate-700 text-[10px]">
                                {p.prerequisite?.code}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-gray-500 text-xs">-</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-gray-300 py-4">
                        <div className="text-[10px] space-y-1">
                          {(course.midtermDate || course.catDay) && (
                            <div className="flex items-center gap-1">
                              <span className="text-emerald-400/70">M/CAT:</span>
                              {course.midtermDate ? new Date(course.midtermDate).toLocaleDateString() : course.catDay}
                            </div>
                          )}
                          {(course.finalExamDate || course.examDay) && (
                            <div className="flex items-center gap-1">
                              <span className="text-cyan-400/70">F/EXAM:</span>
                              {course.finalExamDate ? new Date(course.finalExamDate).toLocaleDateString() : course.examDay}
                            </div>
                          )}
                          {!course.midtermDate && !course.finalExamDate && !course.catDay && !course.examDay && "-"}
                        </div>
                      </TableCell>
                      {isStudent ? (
                        <TableCell className="py-4">
                          <Badge className={grade ? "bg-blue-500" : "bg-gray-500"}>
                            {grade || "Pending"}
                          </Badge>
                        </TableCell>
                      ) : (
                        <>
                          <TableCell className="py-4">
                            <Badge className={course.isActive ? "bg-green-500" : "bg-red-500"}>
                              {course.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right py-4">
                            <div className="flex justify-end gap-1">
                              {canUpdate && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleToggleStatus(course.id, course.isActive)}
                                    className="text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/10"
                                    title={course.isActive ? "Deactivate" : "Activate"}
                                  >
                                    <Power className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleEdit(course)}
                                    className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                                  >
                                    <Edit className="w-4 h-4" />
                                  </Button>
                                </>
                              )}
                              {canDelete && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setDeletingCourse(course)}
                                  className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination - Hide for students */}
      {!isStudent && (data as any)?.pagination && (
        <div className="flex items-center justify-between">
          <p className="text-gray-400 text-sm">
            Showing {((page - 1) * 10) + 1} to {Math.min(page * 10, (data as any).pagination.total)} of {(data as any).pagination.total} courses
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="bg-slate-800 border-emerald-500/30 text-emerald-400"
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => p + 1)}
              disabled={page >= (data as any).pagination.totalPages}
              className="bg-slate-800 border-emerald-500/30 text-emerald-400"
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Student course count */}
      {isStudent && coursesData && (
        <div className="text-center text-gray-400 text-sm">
          {coursesData.length} enrolled course{coursesData.length !== 1 ? 's' : ''}
        </div>
      )}

      {/* Delete Dialog */}
      <AlertDialog open={!!deletingCourse} onOpenChange={() => setDeletingCourse(null)}>
        <AlertDialogContent className="bg-slate-800 border-emerald-500/30">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Are you sure?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              This will delete the course "{deletingCourse?.code} - {deletingCourse?.name}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-700 border-emerald-500/30 text-white hover:bg-slate-600">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCourse}
              className="bg-red-500 hover:bg-red-600"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

 function CourseForm({ onSubmit, initialData, departments, semesters, levels = [], intakes = [], allCourses = [], isSubmitting }: { onSubmit: (data: any) => void; initialData?: any; departments: any[]; semesters: any[]; levels: any[]; intakes: any[]; allCourses: any[]; isSubmitting?: boolean }) {
  const [formData, setFormData] = useState({
    code: initialData?.code || "",
    name: initialData?.name || "",
    description: initialData?.description || "",
    credits: initialData?.credits || 10,
    departmentId: initialData?.departmentId || "",
    semesterId: initialData?.semesterId || "",
    type: initialData?.type || "THEORY",
    weeklyHours: initialData?.weeklyHours || 3,
    lectureHours: initialData?.lectureHours || 0,
    labHours: initialData?.labHours || 0,
    tutorialHours: initialData?.tutorialHours || 0,
    maxStudents: initialData?.maxStudents || 50,
    minStudents: initialData?.minStudents || 10,
    requiresLab: initialData?.requiresLab || false,
    requiresProjector: initialData?.requiresProjector || false,
    requiresComputer: initialData?.requiresComputer || false,
    isElective: initialData?.isElective || false,
    isActive: initialData?.isActive ?? true,
    programType: initialData?.programType || "DAY",
    levelId: initialData?.levelId || "",
    intakeId: initialData?.intakeId || "",
    startDate: initialData?.startDate ? new Date(initialData.startDate).toISOString().split('T')[0] : "",
    endDate: initialData?.endDate ? new Date(initialData.endDate).toISOString().split('T')[0] : "",
    midtermDate: initialData?.midtermDate ? new Date(initialData.midtermDate).toISOString().split('T')[0] : "",
    finalExamDate: initialData?.finalExamDate ? new Date(initialData.finalExamDate).toISOString().split('T')[0] : "",
    catDay: initialData?.catDay || "",
    examDay: initialData?.examDay || "",
    prerequisiteIds: initialData?.prerequisites?.map((p: any) => p.prerequisiteId) || [],
  });

  const [prereqSearch, setPrereqSearch] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-gray-400">Code *</Label>
          <Input
            required
            value={formData.code}
            onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
            className="bg-slate-700 border-emerald-500/30 text-white"
            placeholder="CS101"
          />
        </div>
        <div>
          <Label className="text-gray-400">Name *</Label>
          <Input
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="bg-slate-700 border-emerald-500/30 text-white"
          />
        </div>
      </div>

      <div>
        <Label className="text-gray-400">Description</Label>
        <Textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          className="bg-slate-700 border-emerald-500/30 text-white"
          rows={2}
        />
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div>
          <Label className="text-gray-400">Credits *</Label>
          <Select value={formData.credits.toString()} onValueChange={(v) => setFormData({ ...formData, credits: parseInt(v) })}>
            <SelectTrigger className="bg-slate-700 border-emerald-500/30 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-emerald-500/30">
              <SelectItem value="10" className="text-white">10 Credits</SelectItem>
              <SelectItem value="15" className="text-white">15 Credits</SelectItem>
              <SelectItem value="20" className="text-white">20 Credits</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-gray-400">Weekly Hours *</Label>
          <Input
            type="number"
            required
            min="1"
            max={formData.programType === 'WEEKEND' ? 2 : 5}
            value={formData.weeklyHours}
            onChange={(e) => {
              const max = formData.programType === 'WEEKEND' ? 2 : 5;
              const val = Math.min(parseInt(e.target.value) || 1, max);
              setFormData({ ...formData, weeklyHours: val });
            }}
            className="bg-slate-700 border-emerald-500/30 text-white"
          />
          <p className="text-[10px] text-amber-400/80 mt-1">
            {formData.programType === 'WEEKEND' ? '⚠ Max 2 hrs/week for Weekend (Sat/Sun sessions)' : '⚠ Max 5 hrs/week for Day / Evening'}
          </p>
        </div>
        <div>
          <Label className="text-gray-400">Max Students *</Label>
          <Input
            type="number"
            required
            min="1"
            value={formData.maxStudents}
            onChange={(e) => setFormData({ ...formData, maxStudents: parseInt(e.target.value) })}
            className="bg-slate-700 border-emerald-500/30 text-white"
          />
        </div>
        <div>
          <Label className="text-gray-400">Course Type *</Label>
          <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
            <SelectTrigger className="bg-slate-700 border-emerald-500/30 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-emerald-500/30">
              {COURSE_TYPES.map((type) => (
                <SelectItem key={type} value={type} className="text-white">{type}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label className="text-gray-400">Program *</Label>
          <Select value={formData.programType} onValueChange={(v: any) => {
            // Auto-clamp weeklyHours when switching program type
            const newMax = v === 'WEEKEND' ? 2 : 5;
            const clampedHours = Math.min(formData.weeklyHours, newMax);
            setFormData({ ...formData, programType: v, weeklyHours: clampedHours });
          }}>
            <SelectTrigger className="bg-slate-700 border-emerald-500/30 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-emerald-500/30">
              <SelectItem value="DAY" className="text-white">DAY</SelectItem>
              <SelectItem value="EVENING" className="text-white">EVENING</SelectItem>
              <SelectItem value="WEEKEND" className="text-white">WEEKEND</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-gray-400">Level *</Label>
          <Select value={formData.levelId} onValueChange={(v) => setFormData({ ...formData, levelId: v })}>
            <SelectTrigger className="bg-slate-700 border-emerald-500/30 text-white">
              <SelectValue placeholder="Select Level" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-emerald-500/30">
              {levels.map((lvl: any) => (
                <SelectItem key={lvl.id} value={lvl.id} className="text-white">{lvl.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-gray-400">Intake</Label>
          <Select value={formData.intakeId} onValueChange={(v) => setFormData({ ...formData, intakeId: v })}>
            <SelectTrigger className="bg-slate-700 border-emerald-500/30 text-white">
              <SelectValue placeholder="Select Intake" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-emerald-500/30">
              <SelectItem value="none" className="text-white">None</SelectItem>
              {/* Only January, March, September intakes are shown */}
              {intakes
                .filter((intake: any) => /january|march|september/i.test(intake.name))
                .map((intake: any) => (
                  <SelectItem key={intake.id} value={intake.id} className="text-white">{intake.name}</SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 border-t border-emerald-500/10 pt-4">
        <div>
          <Label className="text-gray-400">Start Date</Label>
          <Input
            type="date"
            value={formData.startDate}
            onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
            className="bg-slate-700 border-emerald-500/30 text-white"
          />
        </div>
        <div>
          <Label className="text-gray-400">End Date</Label>
          <Input
            type="date"
            value={formData.endDate}
            onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
            className="bg-slate-700 border-emerald-500/30 text-white"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-gray-400">Preferred CAT Day</Label>
          <Select value={formData.catDay} onValueChange={(v) => setFormData({ ...formData, catDay: v })}>
            <SelectTrigger className="bg-slate-700 border-emerald-500/30 text-white">
              <SelectValue placeholder="Select Day" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-emerald-500/30">
              <SelectItem value="MONDAY" className="text-white">Monday</SelectItem>
              <SelectItem value="TUESDAY" className="text-white">Tuesday</SelectItem>
              <SelectItem value="WEDNESDAY" className="text-white">Wednesday</SelectItem>
              <SelectItem value="THURSDAY" className="text-white">Thursday</SelectItem>
              <SelectItem value="FRIDAY" className="text-white">Friday</SelectItem>
              <SelectItem value="SATURDAY" className="text-white">Saturday</SelectItem>
              <SelectItem value="SUNDAY" className="text-white">Sunday</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-gray-400">Preferred Exam Day</Label>
          <Select value={formData.examDay} onValueChange={(v) => setFormData({ ...formData, examDay: v })}>
            <SelectTrigger className="bg-slate-700 border-emerald-500/30 text-white">
              <SelectValue placeholder="Select Day" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-emerald-500/30">
              <SelectItem value="MONDAY" className="text-white">Monday</SelectItem>
              <SelectItem value="TUESDAY" className="text-white">Tuesday</SelectItem>
              <SelectItem value="WEDNESDAY" className="text-white">Wednesday</SelectItem>
              <SelectItem value="THURSDAY" className="text-white">Thursday</SelectItem>
              <SelectItem value="FRIDAY" className="text-white">Friday</SelectItem>
              <SelectItem value="SATURDAY" className="text-white">Saturday</SelectItem>
              <SelectItem value="SUNDAY" className="text-white">Sunday</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 border-t border-emerald-500/10 pt-4">
        <div>
          <Label className="text-gray-400">Midterm Exam Date</Label>
          <Input
            type="date"
            value={formData.midtermDate}
            onChange={(e) => setFormData({ ...formData, midtermDate: e.target.value })}
            className="bg-slate-700 border-emerald-500/30 text-white"
          />
        </div>
        <div>
          <Label className="text-gray-400">Final Exam Date</Label>
          <Input
            type="date"
            value={formData.finalExamDate}
            onChange={(e) => setFormData({ ...formData, finalExamDate: e.target.value })}
            className="bg-slate-700 border-emerald-500/30 text-white"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-gray-400">Course Prerequisites</Label>
        <div className="relative mb-2">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500" />
          <Input
            placeholder="Search prerequisites..."
            value={prereqSearch}
            onChange={(e) => setPrereqSearch(e.target.value)}
            className="pl-8 bg-slate-700/50 border-emerald-500/20 text-sm h-9"
          />
        </div>
        <Card className="bg-slate-700/30 border-emerald-500/20 h-40 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-emerald-500/20">
          <div className="grid grid-cols-2 gap-2">
            {allCourses
              .filter((c: any) => c.id !== initialData?.id && (
                c.code.toLowerCase().includes(prereqSearch.toLowerCase()) ||
                c.name.toLowerCase().includes(prereqSearch.toLowerCase())
              ))
              .map((course: any) => (
                <div key={course.id} className="flex items-center space-x-2 p-1 rounded hover:bg-emerald-500/5 transition-colors">
                  <Checkbox
                    id={`prereq-${course.id}`}
                    checked={formData.prerequisiteIds.includes(course.id)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setFormData({ ...formData, prerequisiteIds: [...formData.prerequisiteIds, course.id] });
                      } else {
                        setFormData({ ...formData, prerequisiteIds: formData.prerequisiteIds.filter((id: string) => id !== course.id) });
                      }
                    }}
                    className="border-emerald-500/30 data-[state=checked]:bg-emerald-500"
                  />
                  <Label
                    htmlFor={`prereq-${course.id}`}
                    className="text-xs text-gray-300 cursor-pointer overflow-hidden text-ellipsis whitespace-nowrap"
                    title={`${course.code}: ${course.name}`}
                  >
                    <span className="font-semibold text-emerald-400 pr-1">{course.code}</span>
                    {course.name}
                  </Label>
                </div>
              ))}
          </div>
        </Card>
        {formData.prerequisiteIds.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            <span className="text-[10px] text-gray-500 uppercase font-bold mr-1 self-center">Selected:</span>
            {formData.prerequisiteIds.map((id: string) => {
              const c = allCourses.find((course: any) => course.id === id);
              return c ? (
                <Badge key={id} variant="secondary" className="bg-emerald-500/10 text-emerald-300 border-emerald-500/20 text-[10px] py-0">
                  {c.code}
                </Badge>
              ) : null;
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-gray-400">Department *</Label>
          <Select required value={formData.departmentId} onValueChange={(v) => setFormData({ ...formData, departmentId: v })}>
            <SelectTrigger className="bg-slate-700 border-emerald-500/30 text-white">
              <SelectValue placeholder="Select Department" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-emerald-500/30">
              {departments.map((dept) => (
                <SelectItem key={dept.id} value={dept.id} className="text-white">{dept.code} - {dept.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-gray-400">Semester *</Label>
          <Select required value={formData.semesterId} onValueChange={(v) => setFormData({ ...formData, semesterId: v })}>
            <SelectTrigger className="bg-slate-700 border-emerald-500/30 text-white">
              <SelectValue placeholder="Select semester" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-emerald-500/30">
              {semesters.map((sem: any) => (
                <SelectItem key={sem.id} value={sem.id} className="text-white">{sem.name || sem.code}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label className="text-gray-400">Lecture Hours</Label>
          <Input
            type="number"
            min="0"
            value={formData.lectureHours}
            onChange={(e) => setFormData({ ...formData, lectureHours: parseInt(e.target.value) || 0 })}
            className="bg-slate-700 border-emerald-500/30 text-white"
          />
        </div>
        <div>
          <Label className="text-gray-400">Lab Hours</Label>
          <Input
            type="number"
            min="0"
            value={formData.labHours}
            onChange={(e) => setFormData({ ...formData, labHours: parseInt(e.target.value) || 0 })}
            className="bg-slate-700 border-emerald-500/30 text-white"
          />
        </div>
        <div>
          <Label className="text-gray-400">Tutorial Hours</Label>
          <Input
            type="number"
            min="0"
            value={formData.tutorialHours}
            onChange={(e) => setFormData({ ...formData, tutorialHours: parseInt(e.target.value) || 0 })}
            className="bg-slate-700 border-emerald-500/30 text-white"
          />
        </div>
      </div>

      <div className="flex gap-6">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="requiresLab"
            checked={formData.requiresLab}
            onCheckedChange={(checked) => setFormData({ ...formData, requiresLab: !!checked })}
          />
          <Label htmlFor="requiresLab" className="text-gray-400 cursor-pointer">Requires Lab</Label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="requiresProjector"
            checked={formData.requiresProjector}
            onCheckedChange={(checked) => setFormData({ ...formData, requiresProjector: !!checked })}
          />
          <Label htmlFor="requiresProjector" className="text-gray-400 cursor-pointer">Requires Projector</Label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="requiresComputer"
            checked={formData.requiresComputer}
            onCheckedChange={(checked) => setFormData({ ...formData, requiresComputer: !!checked })}
          />
          <Label htmlFor="requiresComputer" className="text-gray-400 cursor-pointer">Requires Computer</Label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="isElective"
            checked={formData.isElective}
            onCheckedChange={(checked) => setFormData({ ...formData, isElective: !!checked })}
          />
          <Label htmlFor="isElective" className="text-gray-400 cursor-pointer">Elective</Label>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t border-emerald-500/20">
        <Button
          type="submit"
          disabled={isSubmitting}
          className="bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {initialData ? "Updating..." : "Creating..."}
            </span>
          ) : (
            <>{initialData ? "Update" : "Create"} Course</>
          )}
        </Button>
      </div>
    </form>
  );
}

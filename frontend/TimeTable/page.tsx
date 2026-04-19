"use client";

import { useState } from "react";
import { Plus, Search, Edit, Trash2, Filter, Calendar, Download, Eye, Zap, CheckCircle, XCircle, Clock, FileText, Copy } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useTimetables,
  useTimetable,
  useCreateTimetable,
  useUpdateTimetable,
  useDeleteTimetable,
  useGenerateTimetable,
  usePublishTimetable,
  useUnpublishTimetable,
  useTimetableConflicts,
  useSchoolWideTimetable,
  useAcademicYears,
  useDuplicateTimetable,
  useFaculties,
} from "@/lib/queries";
import { useAuth } from "@/hooks/useAuth";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { hasPermission } from "@/lib/access-control";
import { Card, CardContent } from "@/components/ui/card";
import { Shield } from "lucide-react";
import { useDepartments } from "@/lib/queries";
import { useSemesters } from "@/lib/queries";
import api from "@/lib/api";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";

export default function TimetablesPage() {
  const { user } = useAuth();

  // Access control
  const canView = hasPermission(user?.timetableAccess, 'timetables', 'view');
  const canCreate = hasPermission(user?.timetableAccess, 'timetables', 'create');
  const canUpdate = hasPermission(user?.timetableAccess, 'timetables', 'update');
  const canDelete = hasPermission(user?.timetableAccess, 'timetables', 'delete');
  const canGenerate = hasPermission(user?.timetableAccess, 'timetables', 'generate');
  const canPublish = hasPermission(user?.timetableAccess, 'timetables', 'publish');

  // State
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [departmentFilter, setDepartmentFilter] = useState<string>(user?.hodDepartmentId || "all");
  const [isGenerateDialogOpen, setIsGenerateDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedTimetable, setSelectedTimetable] = useState<string | null>(null);
  const [deletingTimetable, setDeletingTimetable] = useState<any>(null);
  const [isDuplicateDialogOpen, setIsDuplicateDialogOpen] = useState(false);
  const [timetableToDuplicate, setTimetableToDuplicate] = useState<any>(null);
  const [duplicateForm, setDuplicateForm] = useState({
    validFrom: "",
    validTo: "",
    name: "",
  });

  // Fetch data
  const { data: timetablesData, isLoading } = useTimetables({
    page,
    limit: 20,
    search: search || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    departmentId: departmentFilter !== "all" ? departmentFilter : undefined,
  });

  const { data: departmentsData } = useDepartments();
  const { data: facultiesData } = useFaculties();
  const { data: academicYearsData } = useAcademicYears();
  
  // Local state for academic year selection in modal
  const [modalAcademicYearId, setModalAcademicYearId] = useState<string>("");

  const { data: semestersData } = useSemesters({
    academicYearId: modalAcademicYearId || undefined
  });

  // Mutations
  const generateMutation = useGenerateTimetable();
  const publishMutation = usePublishTimetable();
  const unpublishMutation = useUnpublishTimetable();
  const deleteMutation = useDeleteTimetable();
  const duplicateMutation = useDuplicateTimetable();

  // Generate form state
  const [generateForm, setGenerateForm] = useState({
    departmentId: "", 
    facultyId: user?.hodFacultyId || "",
    semesterId: "",
    validFrom: new Date().toISOString().split('T')[0],
    validTo: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    method: "CSP" as "CSP" | "GENETIC" | "MANUAL" | "HYBRID",
    constraints: {
      maxInstructorHours: 20,
      preferMorningSlots: true,
      avoidBackToBack: true,
    },
    programTypes: ['DAY'] as string[],
  });

  const isHOD = user?.role === 'HOD' || user?.roles?.some((r: any) => r.role?.name === 'HOD');

  if (!canView) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <Shield className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">Access Denied</h2>
            <p className="text-gray-400">You don't have permission to view timetables.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const timetables = timetablesData?.data || [];
  const pagination = (timetablesData as any)?.pagination;

  const handleGenerate = async () => {
    if (!generateForm.semesterId) {
      toast.error("Please select semester");
      return;
    }

    try {
      // If no department selected, generate school-wide (don't send departmentId)
      const generateData: any = {
        semesterId: generateForm.semesterId,
        validFrom: generateForm.validFrom,
        validTo: generateForm.validTo,
        method: generateForm.method,
        constraints: generateForm.constraints,
        programTypes: generateForm.programTypes,
      };

      // Only include IDs if they are not empty
      if (generateForm.departmentId && generateForm.departmentId.trim() !== '') {
        generateData.departmentId = generateForm.departmentId;
      }
      
      if (generateForm.facultyId && generateForm.facultyId.trim() !== '') {
        generateData.facultyId = generateForm.facultyId;
      }

      await generateMutation.mutateAsync(generateData);
      setIsGenerateDialogOpen(false);
      setGenerateForm({
        departmentId: "",
        facultyId: user?.hodFacultyId || "",
        semesterId: "",
        validFrom: new Date().toISOString().split('T')[0],
        validTo: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        method: "GENETIC",
        constraints: {
          maxInstructorHours: 20,
          preferMorningSlots: true,
          avoidBackToBack: true,
        },
        programTypes: ['DAY'],
      });
    } catch (error) {
      console.error("Generation error:", error);
    }
  };

  const handlePublish = async (id: string) => {
    try {
      await publishMutation.mutateAsync(id);
    } catch (error) {
      console.error("Publish error:", error);
    }
  };

  const handleUnpublish = async (id: string) => {
    try {
      await unpublishMutation.mutateAsync(id);
    } catch (error) {
      console.error("Unpublish error:", error);
    }
  };

  const handleDeleteTimetable = async () => {
    if (!deletingTimetable) return;
    try {
      await deleteMutation.mutateAsync(deletingTimetable.id);
      setDeletingTimetable(null);
    } catch (error) {
      console.error("Delete error:", error);
    }
  };

  const handleDuplicate = async () => {
    if (!timetableToDuplicate) return;
    try {
      await duplicateMutation.mutateAsync({
        id: timetableToDuplicate.id,
        data: {
          validFrom: duplicateForm.validFrom,
          validTo: duplicateForm.validTo,
          name: duplicateForm.name || undefined,
        },
      });
      setIsDuplicateDialogOpen(false);
      setTimetableToDuplicate(null);
    } catch (error) {
      console.error("Duplicate error:", error);
    }
  };

  const handleExportPDF = async (timetableId: string) => {
    try {
      const response = await api.get(`/api/timetable/${timetableId}/export?format=pdf`, {
        responseType: 'blob',
      });

      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `timetable_${timetableId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success("Timetable exported successfully!");
    } catch (error) {
      toast.error("Failed to export timetable");
      console.error("Export error:", error);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      DRAFT: { label: "Draft", variant: "outline" },
      GENERATING: { label: "Generating", variant: "secondary" },
      GENERATED: { label: "Generated", variant: "default" },
      PUBLISHED: { label: "Published", variant: "default" },
      ARCHIVED: { label: "Archived", variant: "secondary" },
      FAILED: { label: "Failed", variant: "destructive" },
    };
    const statusInfo = statusMap[status] || { label: status, variant: "outline" };
    return <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Timetables</h1>
          <p className="text-gray-400 mt-1">Manage and generate weekly timetables</p>
        </div>
        {canGenerate && (
          <Dialog open={isGenerateDialogOpen} onOpenChange={setIsGenerateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600">
                <Zap className="w-4 h-4 mr-2" />
                Generate Timetable
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-gray-800 border-gray-700 max-w-2xl">
              <DialogHeader>
                <DialogTitle className="text-white">Generate New Timetable</DialogTitle>
                <DialogDescription className="text-gray-400">
                  Automatically generate a timetable for a Department and semester
                </DialogDescription>
              </DialogHeader>
               <div className="space-y-4">
                <div>
                  <Label className="text-white">Faculty *</Label>
                  <Select
                    value={generateForm.facultyId}
                    onValueChange={(value) => setGenerateForm({ ...generateForm, facultyId: value })}
                    disabled={!!user?.hodFacultyId}
                  >
                    <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                      <SelectValue placeholder="Select faculty" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-700 border-gray-600">
                      {!user?.hodFacultyId && (
                        <SelectItem value="all" className="text-white">
                          All Faculties (School-Wide)
                        </SelectItem>
                      )}
                      {facultiesData?.data?.map((faculty: any) => (
                        <SelectItem key={faculty.id} value={faculty.id} className="text-white">
                          {faculty.code} - {faculty.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {user?.hodFacultyId && <p className="text-[10px] text-emerald-400 mt-1">HOD access focused on your faculty</p>}
                </div>
                <div>
                  {/* <Label className="text-white">Academic Year *</Label>
                  <Select
                    value={modalAcademicYearId}
                    onValueChange={(value) => {
                      setModalAcademicYearId(value);
                      setGenerateForm({ ...generateForm, semesterId: "" });
                    }}
                  >
                    <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                      <SelectValue placeholder="Select Academic Year" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-700 border-gray-600">
                      {academicYearsData?.data?.map((year: any) => (
                        <SelectItem key={year.id} value={year.id} className="text-white">
                          {year.year} {year.isCurrent ? "(Current)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select> */}
                </div>
                <div>
                  <Label className="text-white">Semester</Label>
                  <Select
                    value={generateForm.semesterId}
                    onValueChange={(value) => setGenerateForm({ ...generateForm, semesterId: value })}
                  >
                    <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                      <SelectValue placeholder="Select semester" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-700 border-gray-600">
                      {semestersData?.data?.map((sem: any) => (
                        <SelectItem key={sem.id} value={sem.id} className="text-white">
                          {sem.name} ({sem.type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-white">Start Date *</Label>
                    <Input
                      type="date"
                      value={generateForm.validFrom}
                      onChange={(e) => setGenerateForm({ ...generateForm, validFrom: e.target.value })}
                      className="bg-gray-700 border-gray-600 text-white"
                    />
                  </div>
                  <div>
                    <Label className="text-white">End Date *</Label>
                    <Input
                      type="date"
                      value={generateForm.validTo}
                      onChange={(e) => setGenerateForm({ ...generateForm, validTo: e.target.value })}
                      className="bg-gray-700 border-gray-600 text-white"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-white">Program Types (Select at least one)</Label>
                  <div className="flex flex-wrap gap-4 mt-2">
                    {['DAY', 'EVENING', 'WEEKEND'].map((type) => (
                      <div key={type} className="flex items-center space-x-2">
                        <Checkbox
                          id={`prog-${type}`}
                          checked={generateForm.programTypes.includes(type)}
                          onCheckedChange={(checked) => {
                            const newTypes = checked
                              ? [...generateForm.programTypes, type]
                              : generateForm.programTypes.filter(t => t !== type);
                            setGenerateForm({ ...generateForm, programTypes: newTypes });
                          }}
                        />
                        <Label htmlFor={`prog-${type}`} className="text-white cursor-pointer">{type}</Label>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-white">Generation Method</Label>
                  <Select
                    value={generateForm.method}
                    onValueChange={(value: any) => setGenerateForm({ ...generateForm, method: value })}
                  >
                    <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-700 border-gray-600">
                      <SelectItem value="GENETIC" className="text-white">Genetic Algorithm</SelectItem>
                      <SelectItem value="CSP" className="text-white">Constraint Satisfaction</SelectItem>
                      <SelectItem value="HYBRID" className="text-white">Hybrid</SelectItem>
                      <SelectItem value="MANUAL" className="text-white">Manual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-white">Constraints</Label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="preferMorning"
                      checked={generateForm.constraints.preferMorningSlots}
                      onChange={(e) =>
                        setGenerateForm({
                          ...generateForm,
                          constraints: { ...generateForm.constraints, preferMorningSlots: e.target.checked },
                        })
                      }
                      className="w-4 h-4"
                    />
                    <Label htmlFor="preferMorning" className="text-white cursor-pointer">
                      Prefer Morning Slots
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="avoidBackToBack"
                      checked={generateForm.constraints.avoidBackToBack}
                      onChange={(e) =>
                        setGenerateForm({
                          ...generateForm,
                          constraints: { ...generateForm.constraints, avoidBackToBack: e.target.checked },
                        })
                      }
                      className="w-4 h-4"
                    />
                    <Label htmlFor="avoidBackToBack" className="text-white cursor-pointer">
                      Avoid Back-to-Back Classes
                    </Label>
                  </div>
                </div>
                <Button
                  onClick={handleGenerate}
                  disabled={generateMutation.isPending}
                  className="w-full bg-gradient-to-r from-yellow-500 to-orange-500"
                >
                  {generateMutation.isPending ? "Generating..." : "Generate Timetable"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Filters */}
      <Card className="bg-gray-800 border-gray-700">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Search timetables..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 bg-gray-700 border-gray-600 text-white"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-[180px] bg-gray-700 border-gray-600 text-white">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="bg-gray-700 border-gray-600">
                <SelectItem value="all" className="text-white">All Status</SelectItem>
                <SelectItem value="DRAFT" className="text-white">Draft</SelectItem>
                <SelectItem value="GENERATED" className="text-white">Generated</SelectItem>
                <SelectItem value="PUBLISHED" className="text-white">Published</SelectItem>
                <SelectItem value="ARCHIVED" className="text-white">Archived</SelectItem>
              </SelectContent>
            </Select>
            <Select 
              value={departmentFilter} 
              onValueChange={setDepartmentFilter}
              disabled={!!user?.hodDepartmentId}
            >
              <SelectTrigger className="w-full md:w-[180px] bg-gray-700 border-gray-600 text-white">
                <SelectValue placeholder="Faculty" />
              </SelectTrigger>
              <SelectContent className="bg-gray-700 border-gray-600">
                {!user?.hodDepartmentId && <SelectItem value="all" className="text-white">All Faculties</SelectItem>}
                {departmentsData?.data?.map((dept: any) => (
                  <SelectItem key={dept.id} value={dept.id} className="text-white">
                    {dept.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="bg-gray-800 border-gray-700">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-gray-400">Loading timetables...</div>
          ) : timetables.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No timetables found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-gray-700 hover:bg-gray-700/50">
                  <TableHead className="text-white w-12">#</TableHead>
                  <TableHead className="text-white">Name</TableHead>
                  <TableHead className="text-white">Semester</TableHead>
                  <TableHead className="text-white">Start Date</TableHead>
                  <TableHead className="text-white">End Date</TableHead>
                  <TableHead className="text-white">Status</TableHead>
                  <TableHead className="text-white">Method</TableHead>
                  <TableHead className="text-white">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {timetables.map((timetable: any, index: number) => (
                  <TableRow key={timetable.id} className="border-gray-700 hover:bg-gray-700/50">
                    <TableCell className="text-gray-400 font-medium py-4 w-12">{index + 1}</TableCell>
                    <TableCell className="text-white font-medium">{timetable.name}</TableCell>
                    <TableCell className="text-gray-300">{timetable.semester?.name || "N/A"}</TableCell>
                    <TableCell className="text-gray-300">{timetable.validFrom ? new Date(timetable.validFrom).toLocaleDateString() : "N/A"}</TableCell>
                    <TableCell className="text-gray-300">{timetable.validTo ? new Date(timetable.validTo).toLocaleDateString() : "N/A"}</TableCell>
                    <TableCell>{getStatusBadge(timetable.status)}</TableCell>
                    <TableCell className="text-gray-300">{timetable.generationMethod || "N/A"}</TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedTimetable(timetable.id);
                            setIsViewDialogOpen(true);
                          }}
                          className="text-blue-400 hover:text-blue-300"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleExportPDF(timetable.id)}
                          className="text-green-400 hover:text-green-300"
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                        {canPublish && timetable.status === "GENERATED" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handlePublish(timetable.id)}
                            className="text-yellow-400 hover:text-yellow-300"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </Button>
                        )}
                        {canPublish && timetable.status === "PUBLISHED" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleUnpublish(timetable.id)}
                            className="text-orange-400 hover:text-orange-300"
                          >
                            <XCircle className="w-4 h-4" />
                          </Button>
                        )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setTimetableToDuplicate(timetable);
                              setDuplicateForm({
                                validFrom: new Date(new Date(timetable.validTo).getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                                validTo: new Date(new Date(timetable.validTo).getTime() + 8 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                                name: timetable.name + " (Copy)",
                              });
                              setIsDuplicateDialogOpen(true);
                            }}
                            className="text-emerald-400 hover:text-emerald-300"
                            title="Duplicate for next week"
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                          {canDelete && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeletingTimetable(timetable)}
                              className="text-red-400 hover:text-red-300"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-400">
            Showing {((page - 1) * 20) + 1} to {Math.min(page * 20, pagination.total)} of {pagination.total} results
          </div>
          <div className="flex space-x-2">
            <Button
              variant="outline"
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
              className="bg-gray-800 border-gray-700 text-white"
            >
              Previous
            </Button>
            <Button
              variant="outline"
              onClick={() => setPage(page + 1)}
              disabled={page >= pagination.totalPages}
              className="bg-gray-800 border-gray-700 text-white"
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* View Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="bg-gray-800 border-gray-700 max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">Timetable Details</DialogTitle>
          </DialogHeader>
          {selectedTimetable && (
            <TimetableView timetableId={selectedTimetable} />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingTimetable} onOpenChange={() => setDeletingTimetable(null)}>
        <AlertDialogContent className="bg-gray-800 border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Are you sure?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              This will delete the timetable for {deletingTimetable?.department?.name} - {deletingTimetable?.semester?.name}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-gray-700 border-gray-600 text-white hover:bg-gray-600">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTimetable}
              className="bg-red-500 hover:bg-red-600"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Duplicate Timetable Dialog */}
      <Dialog open={isDuplicateDialogOpen} onOpenChange={setIsDuplicateDialogOpen}>
        <DialogContent className="bg-gray-800 border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-white">Duplicate Timetable</DialogTitle>
            <DialogDescription className="text-gray-400">
              Create a copy of this timetable for a different week. This will copy all session data.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-white">New Name</Label>
              <Input
                value={duplicateForm.name}
                onChange={(e) => setDuplicateForm({ ...duplicateForm, name: e.target.value })}
                className="bg-gray-700 border-gray-600 text-white"
                placeholder="e.g. CS Year 4 Week 12"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-white">Start Date *</Label>
                <Input
                  type="date"
                  value={duplicateForm.validFrom}
                  onChange={(e) => setDuplicateForm({ ...duplicateForm, validFrom: e.target.value })}
                  className="bg-gray-700 border-gray-600 text-white"
                />
              </div>
              <div>
                <Label className="text-white">End Date *</Label>
                <Input
                  type="date"
                  value={duplicateForm.validTo}
                  onChange={(e) => setDuplicateForm({ ...duplicateForm, validTo: e.target.value })}
                  className="bg-gray-700 border-gray-600 text-white"
                />
              </div>
            </div>
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
              <p className="text-xs text-blue-400">
                <Shield className="w-3 h-3 inline mr-1" />
                Wait! Duplicating will copy all {timetableToDuplicate?.sessions?.length || ''} sessions to the new week.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setIsDuplicateDialogOpen(false)}
              className="bg-gray-700 border-gray-600 text-white hover:bg-gray-600"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDuplicate}
              disabled={duplicateMutation.isPending}
              className="bg-gradient-to-r from-emerald-500 to-cyan-500 text-white"
            >
              {duplicateMutation.isPending ? "Duplicating..." : "Create Duplicate"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TimetableView({ timetableId }: { timetableId: string }) {
  const { data: timetable, isLoading } = useTimetable(timetableId, true);
  const { data: conflictsData } = useTimetableConflicts(timetableId);
  const { data: schoolWideData, isLoading: isLoadingSchoolWide } = useSchoolWideTimetable({
    timetableId,
    startDate: timetable?.validFrom,
    semesterId: timetable?.semesterId,
  });

  if (isLoading || isLoadingSchoolWide) {
    return <div className="text-gray-400">Loading timetable...</div>;
  }

  if (!timetable) {
    return <div className="text-gray-400">Timetable not found</div>;
  }

  const conflicts = conflictsData?.conflicts || [];

  // Use school-wide data if available, otherwise fall back to regular timetable
  // Group sessions by program type
  const sessionsByProgram: Record<string, any[]> = {
    DAY: [],
    EVENING: [],
    WEEKEND: [],
  };

  timetable.sessions?.forEach((session: any) => {
    const pt = session.programType || 'DAY';
    if (sessionsByProgram[pt]) {
      sessionsByProgram[pt].push(session);
    } else {
      sessionsByProgram['DAY'].push(session);
    }
  });

  return (
    <div className="space-y-8">
      {/* Summary Info */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-800/50 p-4 rounded-lg border border-emerald-500/20">
        <div>
          <Label className="text-gray-400">Semester</Label>
          <p className="text-white font-medium">{timetable.semester?.name || "N/A"}</p>
        </div>
        <div>
          <Label className="text-gray-400">Start Date</Label>
          <p className="text-white font-medium">{timetable.validFrom ? new Date(timetable.validFrom).toLocaleDateString() : "N/A"}</p>
        </div>
        <div>
          <Label className="text-gray-400">End Date</Label>
          <p className="text-white font-medium">{timetable.validTo ? new Date(timetable.validTo).toLocaleDateString() : "N/A"}</p>
        </div>
        <div>
          <Label className="text-gray-400">Status</Label>
          <div><Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 uppercase text-[10px]">{timetable.status}</Badge></div>
        </div>
        <div>
          <Label className="text-gray-400">Total Classes</Label>
          <p className="text-white font-medium">{timetable.sessions?.length || 0}</p>
        </div>
      </div>

      {conflicts && conflicts.length > 0 && (
        <div className="bg-red-900/20 border border-red-500/40 rounded-lg p-4">
          <div className="flex items-center gap-2 text-red-400 font-semibold mb-2">
            <XCircle className="w-5 h-5" />
            <h3>Conflicts Detected ({conflicts.length})</h3>
          </div>
          <ul className="text-red-300 text-sm space-y-1 ml-7 list-disc">
            {conflicts.slice(0, 5).map((conflict: any, index: number) => (
              <li key={index}>{conflict.description || conflict.type}</li>
            ))}
            {conflicts.length > 5 && <li className="italic">...and {conflicts.length - 5} more</li>}
          </ul>
        </div>
      )}

      {/* Render sections for each program type */}
      {['DAY', 'EVENING', 'WEEKEND'].map((program) => {
        const programSessions = sessionsByProgram[program];
        if (!programSessions || programSessions.length === 0) return null;

        return (
          <div key={program} className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent to-emerald-500/30"></div>
              <h3 className="text-xl font-bold text-emerald-400 bg-emerald-500/10 px-4 py-1 rounded-full border border-emerald-500/20">
                {program} PROGRAM
              </h3>
              <div className="h-px flex-1 bg-gradient-to-l from-transparent to-emerald-500/30"></div>
            </div>

            <ProgramTimetableGrid sessions={programSessions} />
          </div>
        );
      })}
    </div>
  );
}

function ProgramTimetableGrid({ sessions }: { sessions: any[] }) {
  // Group sessions by "Class" (Level + Dept + Intake)
  const sessionsByClass = new Map<string, any[]>();
  sessions.forEach(session => {
    const groupSuffix = session.group ? ` (${session.group})` : '';
    const classKey = `${session.course?.level || 'Unknown Level'} ${session.course?.department?.code || ''} ${session.course?.name || ''}${groupSuffix}`;
    if (!sessionsByClass.has(classKey)) {
      sessionsByClass.set(classKey, []);
    }
    sessionsByClass.get(classKey)!.push(session);
  });

  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

  return (
    <div className="overflow-x-auto rounded-lg border border-emerald-500/20">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-800/80 hover:bg-slate-800/80 border-emerald-500/20">
            <TableHead className="text-emerald-400 font-bold border-r border-emerald-500/20 w-[150px]">CLASS / GROUP</TableHead>
            <TableHead className="text-emerald-400 font-bold border-r border-emerald-500/20 w-[80px]">INTAKE</TableHead>
            {days.map(day => (
              <TableHead key={day} className="text-emerald-400 font-bold text-center border-r border-emerald-500/20 min-w-[140px]">
                {day}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from(sessionsByClass.entries()).map(([classKey, classSessions]) => {
            const firstSession = classSessions[0];
            return (
              <TableRow key={classKey} className="border-emerald-500/10 hover:bg-emerald-500/5 bg-slate-900/40">
                <TableCell className="font-semibold text-white border-r border-emerald-500/20 py-4">
                  <div className="flex flex-col">
                    <span className="text-sm">{classKey}</span>
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider">{firstSession.course?.code}</span>
                  </div>
                </TableCell>
                <TableCell className="text-gray-400 text-xs border-r border-emerald-500/20">
                  {firstSession.course?.intake || "-"}
                </TableCell>
                {days.map(day => {
                  const daySessions = classSessions.filter(s => s.timeSlot?.day === day);
                  return (
                    <TableCell key={day} className="p-1 border-r border-emerald-500/20 align-top">
                      <div className="flex flex-col gap-1">
                        {daySessions.map((session, idx) => (
                          <div key={idx} className="bg-emerald-500/10 border border-emerald-500/20 rounded-md p-2 shadow-sm">
                            <div className="flex justify-between items-start mb-1">
                              <span className="text-[10px] font-bold text-emerald-400">{session.timeSlot?.startTime}-{session.timeSlot?.endTime}</span>
                              <div className="flex gap-1">
                                {session.group && (
                                  <Badge className="bg-blue-500/20 text-blue-300 border-none text-[8px] h-4 px-1">{session.group}</Badge>
                                )}
                                <Badge className="bg-emerald-500/20 text-emerald-300 border-none text-[8px] h-4 px-1">{session.room?.number}</Badge>
                              </div>
                            </div>
                            <div className="text-[10px] text-white font-medium leading-tight mb-1">{session.course?.name}</div>
                            <div className="text-[9px] text-gray-400 font-medium">
                              {session.instructor?.user?.firstName?.[0]}. {session.instructor?.user?.lastName}
                            </div>
                          </div>
                        ))}
                      </div>
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

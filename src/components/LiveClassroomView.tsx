import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  MessageCircle,
  Plus,
  Trash2,
  UserCheck,
  UserPlus,
  UserX,
  Users,
  Video,
  XCircle,
} from 'lucide-react';
import {
  buildWhatsAppUrl,
  formatINR,
  summarizeCourseAttendance,
} from '../lib/domainLogic';
import { apiRequest, ApiError } from '../utils/api';
import type { AttendanceStatus, Course, Enrollment } from '../types';

interface LiveClassroomViewProps {
  courseId: string;
  onExit: () => void;
}

interface ClassroomResponse {
  course: Course;
  isAdminView: boolean;
  roster?: Enrollment[];
  myAttendance?: AttendanceStatus;
}

export const LiveClassroomView: React.FC<LiveClassroomViewProps> = ({
  courseId,
  onExit,
}) => {
  const [data, setData] = useState<ClassroomResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Add student state (Admin view)
  const [studentName, setStudentName] = useState('');
  const [studentEmail, setStudentEmail] = useState('');
  const [studentPhone, setStudentPhone] = useState('');
  const [initialAttendance, setInitialAttendance] = useState<AttendanceStatus>('present');
  const [submittingStudent, setSubmittingStudent] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const liveClassUrl = useMemo(() => {
    if (typeof window === 'undefined') return `/?liveClass=${courseId}`;
    return `${window.location.origin}/?liveClass=${courseId}`;
  }, [courseId]);

  const loadClassroom = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<ClassroomResponse>(
        `/api/courses/${courseId}/classroom`,
      );
      setData(res);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Unable to load this live classroom.',
      );
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    loadClassroom();
  }, [loadClassroom]);

  const handleCopyUrl = () => {
    navigator.clipboard?.writeText(liveClassUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 1800);
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentName.trim()) return;
    setSubmittingStudent(true);
    setError(null);
    try {
      await apiRequest(`/api/courses/${courseId}/students`, {
        method: 'POST',
        body: JSON.stringify({
          studentName: studentName.trim(),
          studentEmail: studentEmail.trim() || undefined,
          phone: studentPhone.trim() || undefined,
          attendance: initialAttendance,
        }),
      });
      setStudentName('');
      setStudentEmail('');
      setStudentPhone('');
      setBanner('Student added to live class roster.');
      await loadClassroom();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to add student.',
      );
    } finally {
      setSubmittingStudent(false);
    }
  };

  const handleSetAttendance = async (
    enrollmentId: string,
    attendance: AttendanceStatus,
  ) => {
    setError(null);
    try {
      await apiRequest(`/api/courses/${courseId}/attendance/${enrollmentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ attendance }),
      });
      await loadClassroom();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to update attendance.',
      );
    }
  };

  const handleRemoveStudent = async (enrollmentId: string) => {
    setError(null);
    try {
      await apiRequest(`/api/courses/${courseId}/students/${enrollmentId}`, {
        method: 'DELETE',
      });
      await loadClassroom();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to remove student.',
      );
    }
  };

  const roster = data?.roster || [];
  const attendanceSummary = useMemo(
    () => summarizeCourseAttendance(roster),
    [roster],
  );
  const whatsappUrl = buildWhatsAppUrl(data?.course.whatsappNumber);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 bg-[#08172C]/95 backdrop-blur-md border-b border-[#D4AF37]/30 px-4 sm:px-8 py-3.5 flex items-center justify-between gap-4">
        <span className="font-display text-lg font-bold text-[#F5C542] whitespace-nowrap shrink-0">
          PRIME X INNOVATION
        </span>

        <button
          type="button"
          onClick={onExit}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold whitespace-nowrap"
        >
          <ArrowLeft className="w-3.5 h-3.5 text-[#F5C542]" />
          <span>Back to Portal</span>
        </button>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-8 py-6 space-y-6">
        {loading ? (
          <div className="rounded-2xl bg-white/10 p-10 text-center text-slate-300 text-sm">
            Connecting to Live Classroom...
          </div>
        ) : error && !data ? (
          <div className="rounded-2xl bg-white text-slate-900 p-8 text-center space-y-4 max-w-lg mx-auto shadow-xl">
            <XCircle className="w-10 h-10 text-red-600 mx-auto" />
            <h1 className="font-display text-xl font-bold text-[#0B1F3A]">
              Live Classroom Unavailable
            </h1>
            <p className="text-sm text-slate-600">{error}</p>
            <button
              type="button"
              onClick={onExit}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5C542] text-[#0B1F3A] text-sm font-bold"
            >
              Return to Live Classes
            </button>
          </div>
        ) : data ? (
          <>
            {error && (
              <div
                role="alert"
                className="p-4 rounded-xl bg-red-950/70 border border-red-400/40 text-red-200 text-sm"
              >
                {error}
              </div>
            )}

            {banner && (
              <div className="p-3.5 rounded-xl bg-[#D4AF37]/20 border border-[#F5C542]/50 text-[#F5C542] text-sm font-medium">
                {banner}
              </div>
            )}

            {/* Course Header Banner */}
            <section className="rounded-2xl bg-[#091930]/95 border border-[#D4AF37]/35 p-6 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#F5C542]">
                    <Video className="w-4 h-4" />
                    <span>
                      {data.isAdminView
                        ? 'Admin Live Class & Attendance Room'
                        : 'Verified Student Live Classroom'}
                    </span>
                  </div>
                  <h1 className="font-display text-2xl font-bold text-white">
                    {data.course.title}
                  </h1>
                  <p className="text-sm text-slate-300 max-w-2xl">
                    {data.course.description || 'Interactive live cohort session.'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {whatsappUrl && (
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>WhatsApp: {data.course.whatsappNumber}</span>
                    </a>
                  )}
                  {data.course.meetingLink && (
                    <a
                      href={data.course.meetingLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5C542] text-[#0B1F3A] text-xs font-bold shadow"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>Open External Session Link</span>
                    </a>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-6 pt-2 border-t border-white/10 text-xs text-slate-300">
                <span className="inline-flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-[#F5C542]" />
                  <span>Instructor: {data.course.instructor}</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-[#F5C542]" />
                  <span>{data.course.schedule}</span>
                </span>
                <span className="font-mono font-semibold text-[#F5C542]">
                  Fee: {formatINR(data.course.fee)}
                </span>
              </div>

              {/* Shareable Live Class URL */}
              <div className="rounded-xl bg-[#061121] border border-white/15 p-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-400">
                    Official Live Class URL
                  </div>
                  <div className="font-mono text-xs text-[#F5C542] truncate">
                    {liveClassUrl}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCopyUrl}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#F5C542] text-[#0B1F3A] text-xs font-bold shrink-0"
                >
                  {copiedUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedUrl ? 'Copied URL' : 'Copy URL'}</span>
                </button>
              </div>
            </section>

            {/* ADMIN VIEW: Add Students & Present / Absent Attendance */}
            {data.isAdminView ? (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left: Add New Student + Present/Absent Summary */}
                <div className="lg:col-span-5 space-y-5">
                  <form
                    onSubmit={handleAddStudent}
                    className="bg-white text-slate-900 rounded-2xl p-5 shadow border border-slate-200 space-y-4"
                  >
                    <div className="flex items-center gap-2 font-display font-bold text-[#0B1F3A]">
                      <UserPlus className="w-4 h-4 text-[#D4AF37]" />
                      <span>Add New Student to Live Class</span>
                    </div>

                    <div>
                      <label htmlFor="cls-stu-name" className="block text-xs font-semibold text-slate-700 mb-1">
                        Student Name
                      </label>
                      <input
                        id="cls-stu-name"
                        type="text"
                        required
                        value={studentName}
                        onChange={(e) => setStudentName(e.target.value)}
                        placeholder="e.g., Arjun Kumar"
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                      />
                    </div>

                    <div>
                      <label htmlFor="cls-stu-email" className="block text-xs font-semibold text-slate-700 mb-1">
                        Student Email (optional)
                      </label>
                      <input
                        id="cls-stu-email"
                        type="email"
                        value={studentEmail}
                        onChange={(e) => setStudentEmail(e.target.value)}
                        placeholder="student@example.com"
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="cls-stu-phone" className="block text-xs font-semibold text-slate-700 mb-1">
                          Phone (optional)
                        </label>
                        <input
                          id="cls-stu-phone"
                          type="tel"
                          value={studentPhone}
                          onChange={(e) => setStudentPhone(e.target.value)}
                          placeholder="9876543210"
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono"
                        />
                      </div>
                      <div>
                        <label htmlFor="cls-stu-att" className="block text-xs font-semibold text-slate-700 mb-1">
                          Attendance
                        </label>
                        <select
                          id="cls-stu-att"
                          value={initialAttendance}
                          onChange={(e) =>
                            setInitialAttendance(e.target.value as AttendanceStatus)
                          }
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                        >
                          <option value="present">Present</option>
                          <option value="absent">Absent</option>
                          <option value="unmarked">Unmarked</option>
                        </select>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={submittingStudent}
                      className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5C542] text-[#0B1F3A] text-sm font-bold shadow flex items-center justify-center gap-1.5"
                    >
                      <Plus className="w-4 h-4" />
                      <span>{submittingStudent ? 'Adding...' : 'Add Student'}</span>
                    </button>
                  </form>

                  {/* Present & Absent Names Summary */}
                  <div className="bg-white text-slate-900 rounded-2xl p-5 shadow border border-slate-200 space-y-4">
                    <h2 className="font-display font-bold text-[#0B1F3A] flex items-center gap-2">
                      <Users className="w-4 h-4 text-[#D4AF37]" />
                      <span>Attendance Roll Summary</span>
                    </h2>

                    <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3.5 space-y-1.5">
                      <div className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Present Students ({attendanceSummary.presentNames.length})</span>
                      </div>
                      {attendanceSummary.presentNames.length === 0 ? (
                        <p className="text-xs text-emerald-700/80">No students marked present yet.</p>
                      ) : (
                        <p className="text-xs font-medium text-emerald-950">
                          {attendanceSummary.presentNames.join(', ')}
                        </p>
                      )}
                    </div>

                    <div className="rounded-xl bg-red-50 border border-red-200 p-3.5 space-y-1.5">
                      <div className="text-xs font-bold text-red-800 flex items-center gap-1.5">
                        <UserX className="w-4 h-4" />
                        <span>Absent Students ({attendanceSummary.absentNames.length})</span>
                      </div>
                      {attendanceSummary.absentNames.length === 0 ? (
                        <p className="text-xs text-red-700/80">No students marked absent.</p>
                      ) : (
                        <p className="text-xs font-medium text-red-950">
                          {attendanceSummary.absentNames.join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Interactive Roster */}
                <div className="lg:col-span-7 bg-white text-slate-900 rounded-2xl p-6 shadow border border-slate-200 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                    <h2 className="font-display text-lg font-bold text-[#0B1F3A]">
                      Class Student Roster ({roster.length})
                    </h2>
                    <span className="text-xs font-mono text-slate-500">
                      Present: {attendanceSummary.presentNames.length} · Absent:{' '}
                      {attendanceSummary.absentNames.length}
                    </span>
                  </div>

                  {roster.length === 0 ? (
                    <div className="py-10 text-center text-sm text-slate-500">
                      No students in this live class yet. Add students using the form on the left.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {roster.map((stu) => (
                        <div
                          key={stu.id}
                          className="py-3.5 flex flex-wrap items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900">
                              {stu.studentName}
                            </div>
                            <div className="text-xs text-slate-500">
                              {stu.studentEmail}
                              {stu.phone ? ` · ${stu.phone}` : ''}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleSetAttendance(stu.id, 'present')}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                stu.attendance === 'present'
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              }`}
                            >
                              Present
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSetAttendance(stu.id, 'absent')}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                stu.attendance === 'absent'
                                  ? 'bg-red-600 text-white'
                                  : 'bg-red-50 text-red-700 hover:bg-red-100'
                              }`}
                            >
                              Absent
                            </button>
                            <button
                              type="button"
                              aria-label={`Remove ${stu.studentName}`}
                              onClick={() => handleRemoveStudent(stu.id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* STUDENT VIEW */
              <section className="bg-white text-slate-900 rounded-2xl p-6 sm:p-8 shadow border border-slate-200 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
                  <div className="flex items-center gap-2 text-emerald-700 font-display font-bold">
                    <CheckCircle2 className="w-5 h-5" />
                    <span>Enrolled Student Live Class Room</span>
                  </div>
                  <div className="text-xs font-mono font-semibold text-[#0B1F3A]">
                    Your Attendance:{' '}
                    <span className="uppercase">
                      {data.myAttendance || 'unmarked'}
                    </span>
                  </div>
                </div>

                <p className="text-sm text-slate-600 leading-relaxed">
                  You are verified for <strong>{data.course.title}</strong> with{' '}
                  <strong>{data.course.instructor}</strong> ({data.course.schedule}).
                  {data.course.meetingLink
                    ? ' Use the external session button above to join the live broadcast.'
                    : ' Contact the instructor via WhatsApp if you need direct session assistance or schedule updates.'}
                </p>

                {whatsappUrl && (
                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>Message on WhatsApp ({data.course.whatsappNumber})</span>
                  </a>
                )}
              </section>
            )}
          </>
        ) : null}
      </main>
    </div>
  );
};

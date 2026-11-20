import React, { useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  GraduationCap,
  Lock,
  MessageCircle,
  UserCheck,
  Video,
} from 'lucide-react';
import { buildWhatsAppUrl, formatINR } from '../lib/domainLogic';
import { apiRequest, ApiError } from '../utils/api';
import type { Course, Order } from '../types';

interface LiveClassesTabProps {
  courses: Course[];
  orders: Order[];
  onOrderCreated: (order: Order) => void;
  onOpenPayment: (order: Order) => void;
  onOpenClassroom?: (courseId: string) => void;
  onAiWarning: (msg: string) => void;
}

export const LiveClassesTab: React.FC<LiveClassesTabProps> = ({
  courses,
  orders,
  onOrderCreated,
  onOpenPayment,
  onOpenClassroom,
  onAiWarning,
}) => {
  const [enrollingId, setEnrollingId] = useState<string | null>(null);

  const handleEnrollAndPay = async (course: Course) => {
    // Reuse existing pending order for this course if present
    const existingOrder = orders.find(
      (o) =>
        o.type === 'course' &&
        o.courseId === course.id &&
        o.status !== 'Rejected' &&
        o.status !== 'Verified' &&
        o.status !== 'Completed',
    );
    if (existingOrder) {
      onOpenPayment(existingOrder);
      return;
    }

    setEnrollingId(course.id);
    try {
      const res = await apiRequest<{ order: Order }>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({ type: 'course', courseId: course.id }),
      });
      onOrderCreated(res.order);
      onOpenPayment(res.order);
    } catch (err) {
      onAiWarning(
        err instanceof ApiError ? err.message : 'Could not initiate course enrollment.',
      );
    } finally {
      setEnrollingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 px-6 py-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-white">
            LIVE CLASSES
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 mt-0.5">
            Enroll with UPI verification to unlock your live class session link
          </p>
        </div>
        <div className="text-xs font-medium text-[#F5C542]">
          {courses.length} Active Course{courses.length === 1 ? '' : 's'}
        </div>
      </div>

      {courses.length === 0 ? (
        <div className="rounded-3xl bg-white/10 backdrop-blur-md border border-white/15 p-12 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-[#D4AF37]/15 border border-[#D4AF37]/40 flex items-center justify-center mx-auto text-[#F5C542]">
            <GraduationCap className="w-8 h-8" />
          </div>
          <h2 className="font-display text-xl font-bold text-white">
            No live classes scheduled yet
          </h2>
          <p className="text-sm text-slate-300 max-w-md mx-auto">
            New live instructor cohorts are published here once scheduled by the PRIME X INNOVATION team.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.map((course) => {
            const isVerified =
              course.isEnrolled ||
              course.enrollmentStatus === 'Verified' ||
              course.enrollmentStatus === 'Completed';
            const isPending =
              !isVerified &&
              (course.enrollmentStatus === 'Pending Payment' ||
                course.enrollmentStatus === 'Payment Submitted' ||
                course.enrollmentStatus === 'Needs Admin Review');
            const whatsappUrl = buildWhatsAppUrl(course.whatsappNumber);

            return (
              <article
                key={course.id}
                className="bg-white text-slate-900 rounded-2xl shadow-lg border border-slate-200 p-6 flex flex-col justify-between space-y-5"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500 font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5 text-[#D4AF37]" />
                      {course.instructor}
                    </span>
                    <span className="font-mono font-bold text-[#0B1F3A] tabular-nums">
                      {formatINR(course.fee)}
                    </span>
                  </div>

                  <h3 className="font-display text-lg font-bold text-[#0B1F3A]">
                    {course.title}
                  </h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    {course.description || 'Interactive live mentorship session.'}
                  </p>

                  <div className="pt-1 flex items-center gap-2 text-xs text-slate-600">
                    <Calendar className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>{course.schedule || 'Schedule announced upon enrollment'}</span>
                  </div>

                  {course.whatsappNumber && (
                    <div className="pt-1">
                      {whatsappUrl ? (
                        <a
                          href={whatsappUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:underline"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>WhatsApp Contact: {course.whatsappNumber}</span>
                        </a>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                          <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                          <span>WhatsApp: {course.whatsappNumber}</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-slate-100 space-y-2.5">
                  {isVerified ? (
                    <>
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Payment Verified · Access Unlocked</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onOpenClassroom?.(course.id)}
                        className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5C542] text-[#0B1F3A] font-display font-bold text-sm shadow flex items-center justify-center gap-2 hover:brightness-105"
                      >
                        <Video className="w-4 h-4" />
                        <span>Join Live Class</span>
                      </button>
                      {course.meetingLink && (
                        <a
                          href={course.meetingLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full py-2 px-4 rounded-xl border border-slate-300 text-[#0B1F3A] font-semibold text-xs flex items-center justify-center gap-1.5 hover:bg-slate-50"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Open External Link</span>
                        </a>
                      )}
                    </>
                  ) : isPending ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                        <Clock className="w-4 h-4" />
                        <span>Status: {course.enrollmentStatus}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleEnrollAndPay(course)}
                        className="w-full py-2.5 px-4 rounded-xl bg-[#0B1F3A] text-[#F5C542] text-sm font-bold hover:bg-[#16325C]"
                      >
                        Upload / Check Payment
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <Lock className="w-3.5 h-3.5" />
                        <span>Live link unlocks after payment verification</span>
                      </div>
                      <button
                        type="button"
                        disabled={enrollingId === course.id}
                        onClick={() => handleEnrollAndPay(course)}
                        className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5C542] text-[#0B1F3A] font-display font-bold text-sm shadow hover:brightness-105 disabled:opacity-60"
                      >
                        {enrollingId === course.id
                          ? 'Preparing Checkout...'
                          : `Enroll & Pay ${formatINR(course.fee)}`}
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

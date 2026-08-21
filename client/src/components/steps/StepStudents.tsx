import React, { useEffect, useState } from "react";
import api from "../../api/axios";

export default function StepStudents({ context, onNext, onBack }) {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const allocationId = context.allocation?._id;

  useEffect(() => {
    if (!allocationId) return;
    api.get(`/students/by-allocation/${allocationId}`).then((res) => {
      setStudents(res.data);
      setLoading(false);
    });
  }, [allocationId]);

  return (
    <div className="bg-white rounded-xl shadow-card p-6 mt-4">
      <h2 className="text-lg font-semibold text-brand mb-4">
        Student List — {context.allocation?.paperCode}
      </h2>

      {loading ? (
        <p className="text-gray-500">Loading students...</p>
      ) : students.length === 0 ? (
        <p className="text-amber-600 text-sm">
          No students uploaded yet for this batch. Please ask the admin to upload the roster.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-100 text-left">
                <th className="p-2">#</th>
                <th className="p-2">Reg No</th>
                <th className="p-2">Name</th>
                <th className="p-2">Email</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s, i) => (
                <tr key={s._id} className="border-b">
                  <td className="p-2">{i + 1}</td>
                  <td className="p-2">{s.regNo}</td>
                  <td className="p-2">{s.name}</td>
                  <td className="p-2 text-gray-500">{s.email || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-between mt-6">
        <button onClick={onBack} className="btn btn-ghost">← Back</button>
        <button onClick={onNext} disabled={!students.length} className="btn btn-primary">
          Next →
        </button>
      </div>
    </div>
  );
}

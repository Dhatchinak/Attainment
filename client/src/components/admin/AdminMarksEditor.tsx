import React, { useEffect, useState } from "react";
import api from "../../api/axios";

export default function AdminMarksEditor({ record, onClose }) {
  const [cia, setCia] = useState(null);
  const [ese, setEse] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([api.get(`/cia/${record.allocationId}`), api.get(`/ese/${record.allocationId}`)])
      .then(([ciaResult, eseResult]) => { setCia(ciaResult.data); setEse(eseResult.data); })
      .catch((requestError) => setError(requestError.response?.data?.message || "Marks cannot be edited until threshold settings are configured for this allocation."));
  }, [record.allocationId]);

  function updateCia(rowIndex, key, value, max) {
    setCia((current) => ({ ...current, grid: current.grid.map((row, index) => index === rowIndex ? { ...row, componentMarks: { ...row.componentMarks, [key]: value === "" ? null : { obtained: value, max } } } : row) }));
  }
  function updateEse(rowIndex, value) {
    setEse((current) => ({ ...current, grid: current.grid.map((row, index) => index === rowIndex ? { ...row, obtained: value } : row) }));
  }
  async function save() {
    setSaving(true); setError(""); setMessage("");
    try {
      await Promise.all([
        api.post(`/cia/${record.allocationId}/bulk`, { entries: cia.grid.map((row) => ({ studentId: row.student._id, componentMarks: row.componentMarks || {} })) }),
        api.post(`/ese/${record.allocationId}/bulk`, { entries: ese.grid.map((row) => ({ studentId: row.student._id, obtained: row.obtained })) }),
      ]);
      setMessage("CIA and ESE marks saved in MongoDB.");
    } catch (requestError) { setError(requestError.response?.data?.message || "Could not save marks."); }
    finally { setSaving(false); }
  }

  return <div className="fixed inset-0 z-50 bg-slate-950/50 p-4 grid place-items-center" onClick={onClose}><div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-auto p-6" onClick={(event) => event.stopPropagation()}>
    <div className="flex justify-between gap-4"><div><span className="section-kicker">ADMIN MARK EDITOR</span><h3 className="font-display text-xl font-bold">{record.paperCode} · {record.paperTitle}</h3><p className="text-sm text-gray-500">{record.course} · {record.academicYear} · {record.section}</p></div><button className="btn btn-ghost" onClick={onClose}>Close</button></div>
    {error && <p className="alert-error mt-4">{error}</p>}{message && <p className="alert-success mt-4">{message}</p>}
    {!cia && !error && <div className="loading-state py-10">Loading student marks...</div>}
    {cia && ese && <><div className="table-shell mt-5"><table className="pro-table"><thead><tr><th>Roll No</th><th className="!text-left">Student</th>{cia.components.map((component) => <th key={component.key}>{component.label}<small className="block opacity-60">/{component.maxMarks}</small></th>)}<th>ESE / {ese.eseMaxMarks}</th></tr></thead><tbody>{cia.grid.map((row, rowIndex) => { const eseRow = ese.grid.find((item) => item.student._id === row.student._id); return <tr key={row.student._id}><td>{row.student.regNo}</td><td className="!text-left">{row.student.name}</td>{cia.components.map((component) => <td key={component.key}><input type="number" min="0" max={component.maxMarks} className="table-input compact" value={row.componentMarks?.[component.key]?.obtained ?? ""} onChange={(event) => updateCia(rowIndex, component.key, event.target.value, component.maxMarks)} /></td>)}<td><input type="number" min="0" max={ese.eseMaxMarks} className="table-input compact" value={eseRow?.obtained ?? ""} onChange={(event) => updateEse(ese.grid.findIndex((item) => item.student._id === row.student._id), event.target.value)} /></td></tr>; })}</tbody></table></div><div className="flex justify-end mt-5"><button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save CIA & ESE Marks"}</button></div></>}
  </div></div>;
}

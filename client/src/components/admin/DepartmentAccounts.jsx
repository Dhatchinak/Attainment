import React, { useCallback, useEffect, useState } from "react";
import api from "../../api/axios";

export default function DepartmentAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState({});

  const load = useCallback(() => {
    setLoading(true);
    api.get("/admin/department-accounts")
      .then((res) => setAccounts(res.data || []))
      .catch(() => setError("Could not load department accounts."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function sync() {
    setSyncing(true); setMessage(""); setError("");
    try {
      const { data } = await api.post("/admin/department-accounts/sync");
      setMessage(`ERP departments synchronized: ${data.created} accounts created and ${data.updated} updated.`);
      load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Department sync failed.");
    } finally { setSyncing(false); }
  }

  async function savePassword(account, random = false) {
    setMessage(""); setError("");
    try {
      const password = random ? "" : (drafts[account._id] || account.password);
      const { data } = await api.patch(`/admin/department-accounts/${account._id}/password`, { password });
      setMessage(`${account.departmentName} password updated to ${data.password}.`);
      setDrafts((current) => ({ ...current, [account._id]: data.password }));
      load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Password update failed.");
    }
  }

  async function toggle(account) {
    await api.patch(`/admin/department-accounts/${account._id}/status`, { isActive: !account.isActive });
    load();
  }

  return <div className="card-surface p-5">
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div><h2 className="font-display text-lg font-bold">Department Login Accounts</h2><p className="text-sm text-gray-500 mt-1">Sync ERP departments, view their assigned credentials and manage read-only department access.</p></div>
      <button className="btn btn-primary" disabled={syncing} onClick={sync}>{syncing ? "Syncing..." : "↻ Sync Departments & Accounts"}</button>
    </div>
    <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs p-3 mt-4">Passwords are displayed only to Admin. Login uses a secure hash; the display copy is encrypted using the server encryption key.</div>
    {message && <p className="alert-success mt-4">{message}</p>}
    {error && <p className="alert-error mt-4">{error}</p>}
    {loading ? <div className="loading-state mt-5">Loading department accounts...</div> : <div className="table-shell mt-5"><table className="pro-table">
      <thead><tr><th className="!text-left">Department</th><th>Code</th><th>Password</th><th>Programmes</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>{accounts.map((account) => <tr key={account._id}>
        <td className="!text-left"><strong>{account.departmentName}</strong><div className="text-xs text-gray-400">Last sync: {account.lastSyncedAt ? new Date(account.lastSyncedAt).toLocaleString() : "—"}</div></td>
        <td><span className="badge bg-blue-50 text-blue-700">{account.departmentCode}</span></td>
        <td><input className="input-field w-28 text-center font-bold tracking-wider" value={drafts[account._id] ?? account.password} onChange={(e) => setDrafts((current) => ({ ...current, [account._id]: e.target.value.toUpperCase() }))} /></td>
        <td>{account.programmeAliases?.length || 0}</td>
        <td><span className={`badge ${account.isActive ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>{account.isActive ? "Active" : "Disabled"}</span></td>
        <td><div className="flex gap-1.5 justify-center flex-wrap"><button className="table-action" onClick={() => savePassword(account)}>Save</button><button className="table-action" onClick={() => savePassword(account, true)}>Random</button><button className={`table-action ${account.isActive ? "danger" : ""}`} onClick={() => toggle(account)}>{account.isActive ? "Disable" : "Enable"}</button></div></td>
      </tr>)}{!accounts.length && <tr><td colSpan={6} className="py-10 text-center text-gray-400">Click Sync Departments & Accounts to create logins from ERP.</td></tr>}</tbody>
    </table></div>}
  </div>;
}

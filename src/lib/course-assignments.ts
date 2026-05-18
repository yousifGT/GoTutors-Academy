export function assignmentRows(roleIds: string[], subPositions: string[]): { roleId: string; subPosition: string | null }[] {
  const rows: { roleId: string; subPosition: string | null }[] = [];
  for (const roleId of roleIds) {
    if (subPositions.length === 0) {
      rows.push({ roleId, subPosition: null });
    } else {
      for (const sp of subPositions) rows.push({ roleId, subPosition: sp });
    }
  }
  return rows;
}

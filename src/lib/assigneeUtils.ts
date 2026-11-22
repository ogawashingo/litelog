// 担当者別課題件数の集計ユーティリティ

export interface AssigneeCountableIssue {
  assignee_id?: number | null;
}

export interface AssigneeCounts {
  userCountMap: Record<number, number>;
  unassignedCount: number;
  myCount: number;
  totalCount: number;
}

/**
 * 課題一覧から担当者ごとの件数、未割当件数、自分担当件数、総件数を集計する
 */
export function calculateAssigneeCounts<T extends AssigneeCountableIssue>(
  issues: T[],
  currentUserId?: number | null
): AssigneeCounts {
  const userCountMap: Record<number, number> = {};
  let unassignedCount = 0;
  let myCount = 0;

  for (const issue of issues) {
    if (issue.assignee_id === null || issue.assignee_id === undefined) {
      unassignedCount++;
    } else {
      userCountMap[issue.assignee_id] = (userCountMap[issue.assignee_id] || 0) + 1;
      if (currentUserId && issue.assignee_id === currentUserId) {
        myCount++;
      }
    }
  }

  return {
    userCountMap,
    unassignedCount,
    myCount,
    totalCount: issues.length,
  };
}

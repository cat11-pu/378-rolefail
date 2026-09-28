// role.js：位点查询与接位
export function pointOf(points, replica) {
  for (const row of points || []) {
    if (row[0] === replica) return row[1];
  }
  return -1;
}

export function tellOf(primary, points, replica) {
  return { primary: replica, point: pointOf(points, replica) };
}

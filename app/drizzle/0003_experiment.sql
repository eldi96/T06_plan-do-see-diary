-- 실제 서로 다른 서울 날짜의 기록만 서버에서 생성한다.
CREATE TABLE IF NOT EXISTS experiment_config (
  owner_id TEXT PRIMARY KEY NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  metric TEXT NOT NULL DEFAULT '날짜별 할 일 완료율' CHECK(metric='날짜별 할 일 완료율'),
  unit TEXT NOT NULL DEFAULT '%' CHECK(unit='%'),
  initial_rule TEXT NOT NULL,
  calculation_rule TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS experiment_days (
  owner_id TEXT NOT NULL REFERENCES experiment_config(owner_id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  planned INTEGER NOT NULL CHECK(planned>=0),
  completed INTEGER NOT NULL CHECK(completed>=0 AND completed<=planned),
  task_snapshot TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  PRIMARY KEY(owner_id,day)
);
CREATE TABLE IF NOT EXISTS experiment_change (
  owner_id TEXT PRIMARY KEY NOT NULL REFERENCES experiment_config(owner_id) ON DELETE CASCADE,
  before_rule TEXT NOT NULL,
  after_rule TEXT NOT NULL,
  reason TEXT NOT NULL,
  changed_at TEXT NOT NULL
);

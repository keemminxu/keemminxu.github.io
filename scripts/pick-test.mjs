// node scripts/pick-test.mjs — 은크크 Pick 순수 로직 테스트 (의존성 없음)
import './pick-test/draw.test.mjs';
import './pick-test/entry.test.mjs';
import './pick-test/store.test.mjs';
import { summary } from './pick-test/harness.mjs';

summary();

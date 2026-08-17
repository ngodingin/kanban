import { strict as assert } from 'assert'
import { parseEnv } from './env'

describe('env.parseEnv', () => {
  it('parses valid environment correctly', () => {
    const env = {
      NODE_ENV: 'development',
      PORT: '3000',
      DATABASE_URL: 'http://example.com/db',
      NEXT_PUBLIC_API_BASE: 'http://localhost:3000/api'
    }
    const cfg = parseEnv(env)
    assert.equal(cfg.NODE_ENV, 'development')
    assert.equal(cfg.PORT, 3000)
    assert.equal(cfg.DATABASE_URL, 'http://example.com/db')
    assert.equal(cfg.NEXT_PUBLIC_API_BASE, 'http://localhost:3000/api')
  })

  it('throws on missing required vars', () => {
    assert.throws(() => {
      parseEnv({})
    }, /Invalid environment variables/)
  })
})

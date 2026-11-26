'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const {evaluate}=require('./numeric');

test('numeric expressions handle precedence, parentheses, powers and decimal commas',()=>{
  assert.equal(evaluate('12-5+(4**3)'),71);
  assert.equal(evaluate('(2 + 3,5) * 4 / 2'),11);
  assert.equal(evaluate('2**3**2'),512);
  assert.equal(evaluate('-2**2'),-4);
  assert.equal(evaluate('(-2)**2'),4);
  assert.equal(evaluate('2**-3'),.125);
  assert.equal(evaluate('1e-3 + 0,2'),.201);
  assert.equal(evaluate('0.1+0.2'),.3);
});

test('numeric expressions reject invalid, unbounded and non-arithmetic input',()=>{
  for(const input of ['', '1/0','1/(2-2)','3(4)','2***3','2+','(1+2','2 3','1e309', 'Math.max(1,2)']) {
    assert.ok(Number.isNaN(evaluate(input)),input);
  }
});

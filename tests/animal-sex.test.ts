import test from 'node:test';
import assert from 'node:assert/strict';
import { formatAnimalSex } from '../shared/animal-sex';

test('medical document sex uses the profile gender when legacy sex is empty', () => {
  assert.equal(formatAnimalSex({ petfinderGender: 'Male', sex: null }), 'Male');
  assert.equal(formatAnimalSex({ petfinderGender: 'Female', sex: '' }), 'Female');
});

test('profile gender takes precedence over a conflicting legacy sex', () => {
  assert.equal(formatAnimalSex({ petfinderGender: 'Male', sex: 'female' }), 'Male');
  assert.equal(formatAnimalSex({ petfinderGender: 'Female', sex: 'male' }), 'Female');
});

test('older records and abbreviated values remain supported', () => {
  assert.equal(formatAnimalSex({ sex: 'male' }), 'Male');
  assert.equal(formatAnimalSex({ petfinderGender: 'Unknown', sex: 'female' }), 'Female');
  assert.equal(formatAnimalSex({ petfinderGender: ' m ' }), 'Male');
  assert.equal(formatAnimalSex({ sex: 'F' }), 'Female');
});

test('unknown or missing values do not invent a sex', () => {
  assert.equal(formatAnimalSex({}), 'Unknown');
  assert.equal(formatAnimalSex({ petfinderGender: 'Unknown', sex: null }), 'Unknown');
  assert.equal(formatAnimalSex({ petfinderGender: '', sex: 'unspecified' }), 'Unknown');
});
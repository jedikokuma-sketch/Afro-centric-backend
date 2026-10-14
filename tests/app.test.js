const request = require('supertest');
const app = require('../src/app');

describe('Express app integration', () => {
  test('returns JSON for unknown routes', async () => {
    const response = await request(app).get('/api/not-a-route');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toMatchObject({
      success: false,
      message: 'Route not found: GET /api/not-a-route',
    });
  });

  test('returns JSON for malformed request bodies', async () => {
    const response = await request(app)
      .post('/api/photos')
      .set('Content-Type', 'application/json')
      .send('{"title":');

    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toMatchObject({
      success: false,
    });
    expect(response.body.message).toBeTruthy();
    expect(response.body.errors).toEqual(expect.any(Array));
  });

  test('returns the shared auth dependency error as JSON for protected photo routes', async () => {
    const response = await request(app).post('/api/photos');

    expect(response.status).toBe(503);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toMatchObject({
      success: false,
      message: expect.stringContaining('Authentication middleware is required'),
    });
  });
});

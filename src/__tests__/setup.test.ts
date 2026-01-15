describe('Project Setup', () => {
  it('should have TypeScript configured correctly', () => {
    const testString: string = 'Hello, TypeScript!';
    expect(typeof testString).toBe('string');
  });

  it('should be able to import Node.js modules', () => {
    const path = require('path');
    expect(typeof path.join).toBe('function');
  });
});

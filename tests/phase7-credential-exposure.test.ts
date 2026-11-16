import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Phase 7: Public Credential Remediation & Security Hardening Suite', () => {
  const publicPageFiles = [
    { name: 'Home Page', path: path.join(__dirname, '..', 'src', 'app', 'page.tsx') },
    { name: 'Inmate Login', path: path.join(__dirname, '..', 'src', 'app', 'inmate', 'login', 'page.tsx') },
    { name: 'Family Login', path: path.join(__dirname, '..', 'src', 'app', 'family', 'login', 'page.tsx') },
    { name: 'Warehouse Login', path: path.join(__dirname, '..', 'src', 'app', 'warehouse', 'login', 'page.tsx') },
    { name: 'Admin Login', path: path.join(__dirname, '..', 'src', 'app', 'admin', 'login', 'page.tsx') },
  ];

  it('ensures no public login page contains raw passwords or PINs', () => {
    const prohibitedSecrets = [
      'Staff123!',
      'Admin123!',
      'Password123!',
      '(PIN: 1234)',
      'pin: 1234',
    ];

    for (const page of publicPageFiles) {
      const content = fs.readFileSync(page.path, 'utf8');
      for (const secret of prohibitedSecrets) {
        expect(content, `${page.name} must not contain raw credential secret "${secret}"`).not.toContain(secret);
      }
    }
  });

  it('ensures public pages do not contain automated demo credential autofill injection handlers', () => {
    const prohibitedAutofillHandlers = [
      'fillPicker',
      'fillSupervisor',
      'fillAdmin',
      'handleDemoFill',
    ];

    for (const page of publicPageFiles) {
      const content = fs.readFileSync(page.path, 'utf8');
      for (const handler of prohibitedAutofillHandlers) {
        expect(content, `${page.name} must not contain autofill handler "${handler}"`).not.toContain(handler);
      }
    }
  });

  it('ensures homepage displays institutional security notice rather than exposed credentials pill', () => {
    const homeContent = fs.readFileSync(path.join(__dirname, '..', 'src', 'app', 'page.tsx'), 'utf8');
    expect(homeContent).not.toContain('A1234567');
    expect(homeContent).not.toContain('picker@canteen.local');
    expect(homeContent).not.toContain('family@canteen.local');
    expect(homeContent).toContain('Authorized Correctional Facility Commissary');
  });

  it('verifies that login forms retain required input attributes for manual authentication', () => {
    const inmateLoginContent = fs.readFileSync(path.join(__dirname, '..', 'src', 'app', 'inmate', 'login', 'page.tsx'), 'utf8');
    expect(inmateLoginContent).toContain('id="offenderId"');
    expect(inmateLoginContent).toContain('id="pin"');
    expect(inmateLoginContent).toContain('type="submit"');

    const warehouseLoginContent = fs.readFileSync(path.join(__dirname, '..', 'src', 'app', 'warehouse', 'login', 'page.tsx'), 'utf8');
    expect(warehouseLoginContent).toContain('id="identifier"');
    expect(warehouseLoginContent).toContain('id="password"');
    expect(warehouseLoginContent).toContain('type="submit"');

    const familyLoginContent = fs.readFileSync(path.join(__dirname, '..', 'src', 'app', 'family', 'login', 'page.tsx'), 'utf8');
    expect(familyLoginContent).toContain('id="email"');
    expect(familyLoginContent).toContain('id="password"');
    expect(familyLoginContent).toContain('type="submit"');

    const adminLoginContent = fs.readFileSync(path.join(__dirname, '..', 'src', 'app', 'admin', 'login', 'page.tsx'), 'utf8');
    expect(adminLoginContent).toContain('id="identifier"');
    expect(adminLoginContent).toContain('id="password"');
    expect(adminLoginContent).toContain('type="submit"');
  });
});


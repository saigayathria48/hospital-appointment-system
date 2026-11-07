'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const { openDatabase } = require('../database');
const { createApp } = require('../index');

test('Chrome: register, search, book and cancel an appointment', { timeout: 120000 }, async t => {
  let db;
  let server;
  let driver;

  t.after(async () => {
    if (driver) await driver.quit();
    if (server) await new Promise(resolve => server.close(resolve));
    if (db) db.close();
  });

  db = openDatabase(':memory:');
  const doctor = db.prepare(
    'INSERT INTO doctors(name, specialization) VALUES (?, ?)'
  ).run('Dr. Selenium', 'Cardiology');
  const doctorId = Number(doctor.lastInsertRowid);
  const appointmentDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata'
  }).format(new Date(Date.now() + 48 * 60 * 60 * 1000));
  db.prepare(
    'INSERT INTO doctor_slots(doctor_id, date, time) VALUES (?, ?, ?)'
  ).run(doctorId, appointmentDate, '12:00');

  server = createApp(db).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const options = new chrome.Options().addArguments(
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--window-size=1440,1000'
  );
  driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();

  const email = `selenium-${crypto.randomBytes(6).toString('hex')}@example.test`;
  const password = crypto.randomBytes(18).toString('base64url');
  const find = css => driver.findElement(By.css(css));
  const click = async css => (await find(css)).click();
  const type = async (css, value) => {
    const input = await find(css);
    await input.clear();
    await input.sendKeys(value);
  };
  const submit = async css => (await find(css)).submit();
  const waitMessage = text => driver.wait(
    async () => (await (await find('#message')).getText()).includes(text),
    10000,
    `Waiting for message: ${text}`
  );

  await driver.get(base);
  await driver.wait(until.elementLocated(By.css('#login-form')), 10000);

  await click('#show-register');
  await type('#register-form input[name=name]', 'Selenium Patient');
  await type('#register-form input[name=email]', email);
  await type('#register-form input[name=password]', password);
  await submit('#register-form');
  await waitMessage('Registration successful');

  await type('#login-form input[name=email]', email);
  await type('#login-form input[name=password]', password);
  await submit('#login-form');
  await driver.wait(async () => (await find('#app-view')).isDisplayed(), 10000);

  await type('#search-form input[name=specialization]', 'Cardiology');
  await submit('#search-form');
  await driver.wait(async () => (
    await driver.findElements(By.css('#doctor-list .doctor-card'))
  ).length === 1, 10000);
  await click('#doctor-list .button-secondary');
  await driver.wait(async () => (
    await driver.findElements(By.css('#slot-list .button-primary'))
  ).length === 1, 10000);
  await click('#slot-list .button-primary');
  await waitMessage('Appointment booked');

  await click('[data-view=appointments]');
  await driver.wait(async () => (await find('#appointment-list')).isDisplayed(), 10000);
  assert.match(await (await find('#appointment-list')).getText(), /Booked/);

  await click('#appointment-list .button-danger');
  await driver.wait(until.alertIsPresent(), 5000);
  await (await driver.switchTo().alert()).accept();
  await waitMessage('Appointment cancelled');
  assert.match(await (await find('#appointment-list')).getText(), /Cancelled/);

  t.diagnostic('Patient registration, login, specialization search, booking and cancellation passed.');
});

/**
 * Relative-date selectors for CiviCRM Profile search date-range fields.
 * Configure `fields` and `timeZone` below. Requires CiviCRM's jQuery UI datepicker.
 */
(function ($) {
  'use strict';
  const config = {
    fields: ['custom_18'],
    // Set to CiviCRM's effective timezone (IANA identifier), supplied by PHP.
    timeZone: 'America/New_York',
    options: [
      {value: 'any', label: 'Any time'},
      {value: 'ending_7.day', label: 'Last 7 days including today', days: 7},
      {value: 'ending_13.day', label: 'Last 13 days including today', days: 13},
      {value: 'ending_30.day', label: 'Last 30 days including today', days: 30},
      {value: 'ending_90.day', label: 'Last 90 days including today', days: 90},
      {value: 'custom', label: 'Custom date range'},
    ],
  };

  // Use calendar arithmetic, not elapsed milliseconds, to avoid DST problems.
  function todayInZone(zone) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date());
    const get = key => Number(parts.find(p => p.type === key).value);
    return new Date(Date.UTC(get('year'), get('month') - 1, get('day')));
  }

  function calendarDate(date) {
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
    };
  }

  function rangeFor(option, zone) {
    if (!option.days)
      return null;
    const end = todayInZone(zone);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - option.days + 1);
    return {
      from: {...calendarDate(start), hour: 0, minute: 0},
      to: {...calendarDate(end), hour: 23, minute: 59},
    };
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function readPickerConfig(hidden) {
    try {
      return JSON.parse(hidden.attr('data-crm-datepicker') || '{}');
    } catch (_) {
      return {};
    }
  }

  function findControls(hidden) {
    const wrapper = hidden.closest('.crm-form-date-wrapper');
    return {
      hidden,
      wrapper,
      date: wrapper.find('input.crm-form-date'),
      time: wrapper.find('input.crm-form-time'),
      settings: readPickerConfig(hidden),
    };
  }

  // CiviCRM's hidden field is the canonical submitted value. Datepicker
  // parsing/formatting is delegated to the initialized jQuery UI widget.
  function setControl(control, value) {
    if (!value) {
      control.date.val('').trigger('change');
      control.time.val('').trigger('change');
      control.hidden.val('').trigger('change');
      return;
    }

    const date = new Date(value.year, value.month - 1, value.day);
    const format = control.date.datepicker('option', 'dateFormat') || 'yy-mm-dd';
    control.date.datepicker('setDate', date);
    control.date.val($.datepicker.formatDate(format, date)).trigger('change');

    if (control.time.length) {
      const h = value.hour;
      const m = value.minute;
      const twelveHour = Number(control.settings.time) === 12;
      const timeText = twelveHour
              ? `${(h % 12) || 12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`
              : `${pad(h)}:${pad(m)}`;
      control.time.val(timeText).trigger('change');
    }
  }

  function dateParts(date) {
    return {
      year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(),
    };
  }

  function readControl(control) {
    const text = control.date.val().trim();
    if (!text)
      return null;
    let date;
    try {
      const format = control.date.datepicker('option', 'dateFormat') || 'yy-mm-dd';
      date = $.datepicker.parseDate(format, text);
    } catch (_) {
      return {invalid: true};
    }
    const time = control.time.val().trim();
    let hour = 0, minute = 0;
    if (time) {
      const match = time.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
      if (!match)
        return {invalid: true};
      hour = Number(match[1]);
      minute = Number(match[2]);
      if (match[3])
        hour = (hour % 12) + (match[3].toUpperCase() === 'PM' ? 12 : 0);
    }
    return {...dateParts(date), hour, minute};
  }

  function same(a, b) {
    return !!a && !!b && !a.invalid && !b.invalid &&
            ['year', 'month', 'day', 'hour', 'minute'].every(k => a[k] === b[k]);
  }

  function initializeField(base) {
    const fromHidden = $('#' + $.escapeSelector(base + '_from'));
    const toHidden = $('#' + $.escapeSelector(base + '_to'));
    if (!fromHidden.length || !toHidden.length)
      return;

    const from = findControls(fromHidden);
    const to = findControls(toHidden);
    if (!from.date.hasClass('hasDatepicker') || !to.date.hasClass('hasDatepicker'))
      return;

    const cell = from.wrapper.parent();
    const select = $('<select class="crm-form-select profile-relative-date-select" />');
    config.options.forEach(option => select.append($('<option />', {
        value: option.value, text: option.label,
      })));
    select.insertBefore(from.wrapper);
    const nativeNodes = from.wrapper.add(to.wrapper);

    function setVisibility(custom) {
      nativeNodes.toggle(custom);
    }

    function inferSelection() {
      const currentFrom = readControl(from);
      const currentTo = readControl(to);
      if (!currentFrom && !currentTo)
        return 'any';
      for (const option of config.options) {
        const range = rangeFor(option, config.timeZone);
        if (range && same(currentFrom, range.from) && same(currentTo, range.to)) {
          return option.value;
        }
      }
      return 'custom';
    }

    select.on('change', function () {
      const option = config.options.find(o => o.value === this.value);
      if (!option)
        return;
      if (option.value === 'custom') {
        setVisibility(true);
        return;
      }
      const range = rangeFor(option, config.timeZone);
      setControl(from, range && range.from);
      setControl(to, range && range.to);
      setVisibility(false);
    });

    const initial = inferSelection();
    select.val(initial);
    setVisibility(initial === 'custom');
  }

  $(function () {
    config.fields.forEach(initializeField);
  });
})(CRM.$);


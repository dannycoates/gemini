import BaseView from './base-view';

export default BaseView.extend({
  template: `<div class="eol-block"><div data-hook="ending-soon">
<strong>This experiment is ending on <span data-hook="completedDate"></span></strong>.<br/><br/>
After then you will still be able to use <span data-hook="title"></span> but we will no longer be providing updates or support.</div>
<!--<div data-hook="experiment-completed">
This experiment was retired on <span data-hook="completedDate"></span> and is no longer supported.</br>
</div>--></div>`,
  props: {
    completedDate: 'string',
    title: 'string'
  },
  bindings: {
    'completedDate': '[data-hook=completedDate]',
    title: '[data-hook=title]'
  }
});

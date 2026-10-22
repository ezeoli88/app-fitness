try {
  if (localStorage.getItem('rutina.device.theme') === 'light') {
    document.documentElement.dataset.theme = 'light';
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', '#F3F8FC');
  }
} catch (error) {
  // El tema oscuro queda como valor inicial.
}

test_filter inline_css converts 3 out of 5 link tags to style tags.
fetch_until $URL 'grep -c <style' 3

# In some test environments these tests can't be run because of
# restrictions on external connections
if [ -z ${DISABLE_FONT_API_TESTS:-} ]; then
  test_filter inline_google_font_css Can inline Google Font API loader CSS
  # Use a more recent version of Chrome UA than our default, which will get
  # a very large (which hit our previous default size limits) CSS using woff2
  WGETRC_OLD=$WGETRC
  export WGETRC=$TESTTMP/wgetrc-chrome
  cat > $WGETRC <<EOF
user_agent =Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/40.0.2214.45 Safari/537.36
EOF

  fetch_until $URL 'grep -c @font-face' 7

  OUT=$($WGET_DUMP $URL)
  check_from "$OUT" fgrep -qi "format('woff2')"
  check_not_from "$OUT" fgrep -qi "format('truetype')"
  check_not_from "$OUT" fgrep -qi "format('embedded-opentype')"
  check_not_from "$OUT" fgrep -qi ".ttf"
  check_not_from "$OUT" fgrep -qi ".eot"

  # Now try with IE6 user-agent. We do this with setting WGETRC due to
  # quoting madness
  export WGETRC=$TESTTMP/wgetrc-ie
  cat > $WGETRC <<EOF
user_agent = Mozilla/4.0 (compatible; MSIE 6.01; Windows NT 6.0)
EOF

  fetch_until $URL 'grep -c @font-face' 1
  # This should get an eot font. (It might also ship a woff, so we don't
  # check_not_from for that)
  OUT=$($WGET_DUMP $URL)
  check_from "$OUT" fgrep -qi ".eot"
  check_not_from "$OUT" fgrep -qi ".ttf"
  export WGETRC=$WGETRC_OLD
fi

test_filter inline_javascript inlines a small JS file.
fetch_until $URL 'grep -c document.write' 1

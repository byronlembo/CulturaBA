(function ($, root, undefined) {
	
	$(function () {
		
		'use strict';

		$('#search_form').on('submit', function(e) {

		    e.preventDefault();

		    const data = $(this).serializeArray();

		    data.push({
		        name: 'action',
		        value: 'filtrar_producciones'
		    });

		    $.ajax({
		        url: ajax_object.ajax_url,
		        type: 'POST',
		        data: data,
		        success: function(response) {

		            $('.search_results').html(response.data.html);

		            lozad().observe();

				        $("html,body").animate({
									scrollTop: $(".search_results").offset().top
								}, 400);

		        }
		    });

		});

		function updateAppliedFilters() {

	    const $form = $('#search_form');
	    const $wrapper = $('.applied_filters .wrapper');

	    $wrapper.empty();

	    // Checkboxes seleccionados
	    $form.find('input[type="checkbox"]:checked').each(function() {

	        const $input = $(this);
	        const name = $input.attr('name');
	        const value = $input.val();
	        const label = $form.find('label[for="' + $input.attr('id') + '"]').text().trim();

	        if (!name || !value || !label) {
	            return;
	        }

	        $wrapper.append(
	            $('<div>', {
	                class: 'applied_filter',
	                'data-name': name,
	                'data-value': value,
	                text: label
	            })
	        );
	    });

	    // Mostrar / ocultar contenedor
	    if ($wrapper.children().length) {
	        $('.applied_filters').show();
	    } else {
	        $('.applied_filters').hide();
	    }
	}

		$('.trigger_search').on('click', function() {
	    $('#search_form').trigger('submit');
		});

		$('#search_form').on('change', 'input[type="checkbox"]', function() {
	    updateAppliedFilters();
		});

		$(document).on('click', '.applied_filter', function() {

		    const $filter = $(this);

		    const name = $filter.data('name');
		    const value = String($filter.data('value'));

		    const $input = $('#search_form')
		        .find('input[name="' + name + '"]')
		        .filter(function() {
		            return String($(this).val()) === value;
		        });

		    $input.prop('checked', false);

		    updateAppliedFilters();

		    $('#search_form').trigger('submit');
		});

		$(function() {
		  updateAppliedFilters();
		});

		// Menu
		$(".menu-button, .menu-close").click(function() {
			$("body").toggleClass("menu_open");
		});
		$(document).keyup(function(e) {
			if (e.key === "Escape") {
				$("body").removeClass("menu_open");
			}
		});

		// Close menu on anchor click
		$(document).on('click', '.menu a[href*="#"]', function () {
			$("body").removeClass("menu_open");
		});

		// Features slider
		if ( $(".featured-container").length ) {
		  const swiper = new Swiper('.featured-container', {
		    pagination: {
		      el: '.featured-pagination',
			  clickable: true
		    },
		    navigation: {
		      nextEl: '.featured-button-next',
		      prevEl: '.featured-button-prev',
		    },
		    autoplay: {
		      delay: 5000,
		    },
		  });
		}

		if ( $(".swiper-carousel").length ) {
		  const swiper = new Swiper('.swiper-carousel', {
		    pagination: {
		      el: '.carousel-pagination',
		    },
		    slidesPerView: 1,
		    spaceBetween: 20,
		    navigation: {
		      nextEl: '.carousel-button-next',
		      prevEl: '.carousel-button-prev',
		    },
		    breakpoints: {
		      // when window width is >= 320px
		      769: {
		        slidesPerView: 4,
		        spaceBetween: 40
		      },
		    }
		  });
		}

		// Load body class
		$(document).ready(function() {
			$("body").addClass("loaded");
		});

		/* back to top */
		$(".go_up").click(function() {
			$("html,body").animate({
				scrollTop: '0'
			}, 400);
		});

		// LazyLoad
		const observer = lozad(); // lazy loads elements with default selector as '.lozad'
		observer.observe();

		$(window).scroll(function() {

			var scroll = $(window).scrollTop();

			/* Show header on scroll */
			if ( scroll > 200 ) {
				$("body").addClass("show_header");
			} else {
				$("body").removeClass("show_header");
			}

			if ( scroll > 500 ) {
				$("body").addClass("show_go_up_search");
			} else {
				$("body").removeClass("show_go_up_search");
			}
		
		  	/* elements on view */
		  	$(".on_view, .details h2").each(function() {
		    	if ($(this).isOnScreen()) {
		        	$(this).addClass("is_on_view");
		    	}
		  	});

		});

		/* elements on view */
		$.fn.isOnScreen = function(){
		    var win = $(window),
		        offset = this.attr("data-offset");

		    var viewport = {
		        top : win.scrollTop(),
		        left : win.scrollLeft()
		    };
		    viewport.right = viewport.left + win.width();
		    viewport.bottom = viewport.top + win.height() - offset;

		    var bounds = this.offset();
		    bounds.right = bounds.left + this.outerWidth();
		    bounds.bottom = bounds.top + this.outerHeight();

		    return (!(viewport.right < bounds.left || viewport.left > bounds.right || viewport.bottom < bounds.top || viewport.top > bounds.bottom));
		};

		// Search
		$(".search").find("input[name='query']").focus(function() {
		  $(this).parent().parent().addClass("expand");
		});
		$(document).mouseup(function(e) {
		    var container = $(".search");
		    if (!container.is(e.target) && container.has(e.target).length === 0) {
		        container.removeClass("expand");
		    }
		});
		$(".filter").find("span").click(function() {
		  $(this).parent().toggleClass("expand");
		});
		$(".filter_by").click(function() {
		  $(this).parent().find(".search").toggleClass("expand");
		});
		$(".go_up_search").click(function() {
		  $(".posts-list").find(".search").toggleClass("expand");
		  $("html,body").animate({
		    scrollTop: $(".posts-list").offset().top
		  }, 400);
		});

		jQuery("#toggle-more-text").click(function () {
	        const textContainer = jQuery("#more-text");

	        if (textContainer.height() === 0) {
	        		//jQuery(this).html('-info');
	            // Mostrar el texto
	            textContainer.animate(
	                { height: textContainer.get(0).scrollHeight },
	                500,
	                function () {
	                    textContainer.css("height", "auto"); // Ajustar altura al contenido
	                }
	            );
	        } else {
	        	//jQuery(this).html('+info');
	            // Ocultar el texto
	            textContainer.animate({ height: 0 }, 500);
	        }
	    });

	    // Gallery
		if ( $("#fotos").length ) {
			fsLightboxInstances['gallery'].props.onOpen = function() {
				$(".fslightbox-container img").each(function() {
					var alt = $(this).attr("alt");
					$('<div class="caption">'+ alt +'</div>').insertAfter($(this));
				});
			}

		  $(document).on('click', '.fslightbox-slide-btn', function () {
		    $(".fslightbox-container img").each(function() {
		      var alt = $(this).attr("alt");
		      $('<div class="caption">'+ alt +'</div>').insertAfter($(this));
		    });
		  });

		  $(document).on('mousedown', '.fslightbox-absoluted', function () {
		    $(".fslightbox-container img").each(function() {
		      var alt = $(this).attr("alt");
		      $('<div class="caption">'+ alt +'</div>').insertAfter($(this));
		    });
		  });

		  $(document).keydown(function(e){
		    if (e.which == 37 || e.which == 39) { 
		     console.log("test");
		      $(".fslightbox-container img").each(function() {
		        var alt = $(this).attr("alt");
		        $('<div class="caption">'+ alt +'</div>').insertAfter($(this));
		      });
		    }
		  });
		}

		function youtube_parser(url){
		    var regExp = /^https?\:\/\/(?:www\.youtube(?:\-nocookie)?\.com\/|m\.youtube\.com\/|youtube\.com\/)?(?:ytscreeningroom\?vi?=|youtu\.be\/|vi?\/|user\/.+\/u\/\w{1,2}\/|embed\/|watch\?(?:.*\&)?vi?=|\&vi?=|\?(?:.*\&)?vi?=)([^#\&\?\n\/<>"']*)/i;
		    var match = url.match(regExp);
		    return (match && match[1].length==11)? match[1] : false;
		}

		// yt-playlist
		function  youtubePlaylist(trigger) {
			var link = trigger.attr("href"),
				playlist = trigger.parent().parent().parent().parent(),
				player = playlist.find(".player");

			playlist.find("a").removeClass("active");
			trigger.addClass("active");

			player.find("iframe").remove();
			player.find(".video-responsive").html('<iframe title="YouTube video player" src="https://www.youtube.com/embed/'+youtube_parser(link)+'?enablejsapi=1&amp;showinfo=0&amp;autoplay=0&amp;rel=0&amp;controls=2&amp;loop=1&amp;modestbranding=1&amp;origin=https://complejoteatral.gob.ar/&amp;rel=0" width="640" height="360" frameborder="0" allowfullscreen="1"></iframe>');
		}
		// first video onload
		if ( $(".yt-playlist").length ) {
			youtubePlaylist($(".yt-playlist .vids li:first-child a"));
		}
		// playlist videos
		$(".yt-playlist .vids a").click(function(e){
			e.preventDefault();
			var player = $(this).parent().parent().parent().parent().find(".player");
			$("html,body").animate({
		        scrollTop: player.offset().top - 80
		    }, 500);
			youtubePlaylist($(this));
		});
		// play videos click on description
		$(document).on('click', '.details a[href^="#"]', function (e) {
		    e.preventDefault();
			var videoNumber = parseFloat( $(this).attr("href").match(/\d+/)[0] ) - 1;
			console.log(videoNumber);
			$(".yt-playlist .vids a:eq("+videoNumber+")").click();
		});

		// trigger scroll
		$(window).scroll();

		// Gallery
		if ( $("#fotos").length ) {
			fsLightboxInstances['gallery'].props.onOpen = function() {
				$(".fslightbox-container img").each(function() {
					var alt = $(this).attr("alt");
					$('<div class="caption">'+ alt +'</div>').insertAfter($(this));
				});
			}

		  $(document).on('click', '.fslightbox-slide-btn', function () {
		    $(".fslightbox-container img").each(function() {
		      var alt = $(this).attr("alt");
		      $('<div class="caption">'+ alt +'</div>').insertAfter($(this));
		    });
		  });

		  $(document).on('mousedown', '.fslightbox-absoluted', function () {
		    $(".fslightbox-container img").each(function() {
		      var alt = $(this).attr("alt");
		      $('<div class="caption">'+ alt +'</div>').insertAfter($(this));
		    });
		  });

		  $(document).keydown(function(e){
		    if (e.which == 37 || e.which == 39) { 
		     console.log("test");
		      $(".fslightbox-container img").each(function() {
		        var alt = $(this).attr("alt");
		        $('<div class="caption">'+ alt +'</div>').insertAfter($(this));
		      });
		    }
		  });
			
		}

		/* Mini info */
		$('body').on('click', '.open_mini_info', function (e){
		  e.preventDefault();

		  $(this).parent().parent().addClass("info_opened");
		});
		$('body').on('click', '.close_mini_info', function (e){
		  e.preventDefault();

		  $(this).parent().parent().parent().removeClass("info_opened");
		});

		/* teatros info */
		/* Set containers height */
      $(".description").each(function() {
        var container = $(this).find(".container").find(".text"),
            textH = container.find("p").height(),
            read_more = $(this).find(".read_more");

        console.log(textH);

        if ( textH < 350 ) {
          container.css("height", "auto");
          read_more.hide();
        }
      });
      /* Read more */
      $(".read_more").click(function() {
        var read_more = $(this),
            container = $(this).parent().find(".container").find(".text"),
            textH = container.find("p").height();

        if ( container.hasClass("expanded") ) {
          container.removeClass("expanded").css("height", 330);
          read_more.html('<span>+</span>Ver más');
        } else {
          container.addClass("expanded").css("height", textH);
          read_more.html('<span>-</span>Ver menos');
        }
      });
    
    $(".toggle_info-tecnica").click(function(e) {
        e.preventDefault();
        $("body").toggleClass("open_salas-info-tecnica");
      });
      $(document).on("click", ".salas-info-tecnica .background", function(e) {
        $("body").removeClass("open_salas-info-tecnica");
      });

      $(".more_info_visit").click(function(e){
			  e.preventDefault();
			  if ( $(this).closest(".grid-item").hasClass("active") ) {
				  $(this).closest(".grid-item").removeClass("active");
				  $(".talleres").removeClass("one_active");
			  } else {
				  $(".grid-item").removeClass("active");
				  $(this).closest(".grid-item").addClass("active");
				  $(".talleres").addClass("one_active");
			  }
		  });

      /* Calendario agenda */
			if ( $("#date").length ) {
			  $(function() {
			    $("#date").daterangepicker({
			      "autoApply": true,
			      singleDatePicker: true,
			      showDropdowns: false,
			      minYear: 1901,
			      minDate: moment(),
			      maxYear: parseInt(moment().format('YYYY'),5),
			      "locale": {
			          "format": "MM/DD/YYYY",
			          "separator": " - ",
			          "applyLabel": "Aplicar",
			          "cancelLabel": "Cancelar",
			          "fromLabel": "Desde",
			          "toLabel": "Hasta",
			          "customRangeLabel": "Custom",
			          "weekLabel": "W",
			          "daysOfWeek": [
			              "Do",
			              "Lu",
			              "Ma",
			              "Mi",
			              "Ju",
			              "Vi",
			              "Sa"
			          ],
			          "monthNames": [
			              "Enero",
			              "Febrero",
			              "Marzo",
			              "Abril",
			              "Mayo",
			              "Junio",
			              "Julio",
			              "Agosto",
			              "Septiembre",
			              "Octubre",
			              "Noviembre",
			              "Diciembre"
			          ],
			        }
			    }, function(start, end, label) {
					
				  var date = moment(start).format('DD-MM-YYYY');
			      history.replaceState({page: 3}, "Complejo Teatral de Buenos Aires | Agenda "+date, "?fecha="+date);

			      $("#date span").html(moment(start).format('DD/MM/YYYY'));

			      var url = $("#date").attr("data-url");

			      $.ajax({
				        url: ajax_object.ajax_url,
				        type: 'POST',
				        data: {
				        	fecha : moment(start).format('YYYY-MM-DD'),
				        	action: 'filtrar_producciones',
				        },
				        success: function(response) {

				            $('.search_results').html(response.data.html);

				            $("#full_date").html(moment(start).locale('es').format('DD MMMM Y'));

				            lozad().observe();

						        // $("html,body").animate({
										// 	scrollTop: $(".search_results").offset().top
										// }, 400);

				        }
				    });

			    });
			  });
			}


		$(".toggle_info-persona").click(function(e) {
			e.preventDefault();
			const name = $(this).attr("data-name"),
			description = $(this).parent().find(".long_description").html();
			$(".salas-info-tecnica .name").html(name);
			$(".salas-info-tecnica .container").html(description);
			$("body").toggleClass("open_salas-info-tecnica");
		});
	  

	});

})( jQuery );